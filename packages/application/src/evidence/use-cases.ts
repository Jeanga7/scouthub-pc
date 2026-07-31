import {
  assertEvidenceByteSize,
  assertEvidenceClassification,
  assertEvidenceExtension,
  assertEvidenceMagicBytes,
  assertEvidenceMime,
  assertEvidenceMimeMatchesType,
  assertEvidenceSha256Hex,
  assertEvidenceVisibility,
  assertSlice5EvidenceType,
  assertUploadableProjectStatus,
  evidenceDownloadUrlTtlSeconds,
  evidenceUploadUrlTtlSeconds,
  EvidenceDomainError,
  normalizeEvidenceDescription,
  normalizeEvidenceTitle,
  type EvidenceClassification,
  type EvidenceMime,
  type EvidenceRejectionCode,
  type EvidenceType,
  type EvidenceVisibility
} from "@scouthub/domain";
import { canAccessEvidence, type EvidenceResource } from "@scouthub/authz";
import type { ActorContext } from "../ports/identity-repository";
import { ObjectStorageError, type ObjectStorage } from "../ports/object-storage";
import { createAuditEvent, type EvidenceAuditAction, type RequestContext } from "../organization/audit";
import { ApplicationError, ConflictError, NotFoundError, ValidationError } from "../organization/errors";
import type { IdGenerator } from "../organization/use-cases";
import type {
  EvidenceDetails,
  EvidenceListPage,
  EvidenceProjectResource,
  EvidenceRepository,
  MediaAssetRecord
} from "../ports/evidence-repository";

export interface Clock {
  now(): Date;
}

export interface InitiateEvidenceUploadInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly projectId: string;
  readonly filename: string;
  readonly mime: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly classification?: string | null;
}

export interface ConfirmEvidenceUploadInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly type: EvidenceType;
  readonly title: string;
  readonly description?: string | null;
  readonly occurredAt?: Date | null;
  readonly visibility?: string | null;
}

export interface CreateEvidenceDownloadUrlInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly projectId: string;
  readonly evidenceId: string;
}

export class EvidenceUseCases {
  constructor(
    private readonly repository: EvidenceRepository,
    private readonly storage: ObjectStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async initiateEvidenceUpload(input: InitiateEvidenceUploadInput): Promise<{
    readonly asset: MediaAssetRecord;
    readonly upload: {
      readonly url: string;
      readonly method: "PUT";
      readonly expiresAt: Date;
      readonly requiredHeaders: Record<string, string>;
    };
  }> {
    const mime = domainValidation(() => assertEvidenceMime(input.mime));
    domainValidation(() => assertEvidenceExtension(input.filename, mime));
    domainValidation(() => assertEvidenceByteSize(input.bytes, mime));
    const sha256 = domainValidation(() => assertEvidenceSha256Hex(input.sha256));
    const classification = domainValidation(() => assertEvidenceClassification(input.classification));

    const asset = await this.repository.transaction(async (transaction) => {
      const now = this.clock.now();
      const project = await transaction.findProject(input.tenantId, input.projectId);
      if (project === null) {
        throw new NotFoundError("Project not found.");
      }
      domainValidation(() => assertUploadableProjectStatus(project.status));
      assertEvidencePolicy(input.actor, "evidence.create", project, classification, now);
      const pending = await transaction.countPendingUploadsForAccount({
        tenantId: input.tenantId,
        accountId: input.actor.account.id,
        now
      });
      if (pending >= 20) {
        throw new ValidationError("Too many pending evidence uploads.", "EVIDENCE_UPLOAD_RATE_LIMITED", 429);
      }
      const assetId = this.ids.generate();
      // Signed PUTs are bearer credentials, so they only ever target a tmp/*
      // object. The immutable evidence key is minted and written by the server.
      const keyNonce = this.ids.generate().replace(/-/g, "");
      const created = await transaction.insertMediaAsset({
        id: assetId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        temporaryObjectKey: temporaryEvidenceKey(input.tenantId, assetId, keyNonce),
        mime,
        byteSize: input.bytes,
        sha256,
        classification,
        uploadedByAccountId: input.actor.account.id,
        uploadExpiresAt: new Date(now.getTime() + evidenceUploadUrlTtlSeconds * 1000)
      });
      await transaction.appendAuditEvent(evidenceAuditEvent({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        resourceId: assetId,
        action: "evidence.upload_initiated",
        actorAccountId: input.actor.account.id,
        requestId: input.requestId,
        metadata: safeEvidenceMetadata(input.projectId, assetId, null, mime, input.bytes, classification)
      }));
      return created;
    });

    try {
      const signed = await this.storage.createUploadUrl({
        key: requireKey(asset.temporaryObjectKey),
        contentType: asset.mime,
        expiresInSeconds: evidenceUploadUrlTtlSeconds
      });
      return {
        asset,
        upload: {
          url: signed.url,
          method: "PUT",
          expiresAt: signed.expiresAt,
          requiredHeaders: signed.requiredHeaders
        }
      };
    } catch (error) {
      try {
        await this.rejectAsset(input, asset.id, "UPLOAD_SIGNING_FAILED");
      } catch {
        // Keep the original signing error authoritative.
      }
      if (error instanceof ObjectStorageError) {
        throw new ApplicationError("Evidence storage unavailable.", "EVIDENCE_STORAGE_UNAVAILABLE", 503);
      }
      throw error;
    }
  }

  async confirmEvidenceUpload(input: ConfirmEvidenceUploadInput): Promise<EvidenceDetails> {
    const type = domainValidation(() => assertSlice5EvidenceType(input.type));
    const title = domainValidation(() => normalizeEvidenceTitle(input.title));
    const description = domainValidation(() => normalizeEvidenceDescription(input.description));
    const visibility = domainValidation(() => assertEvidenceVisibility(input.visibility));

    const claim = await this.repository.transaction(async (transaction) => {
      const project = await transaction.findProjectForUpdate(input.tenantId, input.projectId);
      if (project === null) {
        throw new NotFoundError("Project not found.");
      }
      domainValidation(() => assertUploadableProjectStatus(project.status));
      const asset = await transaction.findMediaAssetForUpdate(input.tenantId, input.projectId, input.assetId);
      if (asset === null) {
        throw new NotFoundError("Evidence upload not found.");
      }
      assertEvidencePolicy(input.actor, "evidence.create", project, asset.classification, this.clock.now());

      const existing = await transaction.findEvidenceByAsset(input.tenantId, input.projectId, input.assetId);
      if (existing !== null) {
        if (
          existing.evidence.type === type &&
          existing.evidence.title === title &&
          existing.evidence.description === description &&
          sameDate(existing.evidence.occurredAt, input.occurredAt ?? null) &&
          existing.evidence.visibility === visibility
        ) {
          return { kind: "existing" as const, existing };
        }
        throw new ConflictError("Evidence upload was already confirmed with different metadata.");
      }

      if (asset.uploadStatus === "VERIFYING") {
        throw new ValidationError("Evidence verification is already in progress.", "EVIDENCE_VERIFICATION_IN_PROGRESS", 409);
      }
      if (asset.uploadStatus === "REJECTED") {
        throw new ConflictError("Evidence upload has already been rejected.");
      }
      if (asset.uploadStatus === "VERIFIED") {
        if (existing !== null) {
          return { kind: "existing" as const, existing };
        }
        throw new ConflictError("Evidence upload has already been confirmed.");
      }
      if (asset.uploadExpiresAt <= this.clock.now()) {
        const rejected = await transaction.markMediaAssetRejected({
          tenantId: input.tenantId,
          assetId: asset.id,
          status: "UPLOAD_EXPIRED",
          now: this.clock.now()
        });
        if (rejected === null) {
          throw new ConflictError("Evidence upload is not pending.");
        }
        await transaction.appendAuditEvent(evidenceAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceId: asset.id,
          action: "evidence.upload_rejected",
          actorAccountId: input.actor.account.id,
          requestId: input.requestId,
          metadata: {
            project_id: input.projectId,
            asset_id: asset.id,
            rejection_code: "UPLOAD_EXPIRED"
          }
        }));
        return { kind: "expired" as const };
      }

      domainValidation(() => assertEvidenceMimeMatchesType(type, asset.mime));

      const claimed = await transaction.claimMediaAssetForVerification({
        tenantId: input.tenantId,
        projectId: input.projectId,
        assetId: asset.id,
        now: this.clock.now()
      });
      if (claimed === null) {
        throw new ValidationError("Evidence verification is already in progress.", "EVIDENCE_VERIFICATION_IN_PROGRESS", 409);
      }
      return { kind: "claimed" as const, asset: claimed };
    });

    if (claim.kind === "existing") {
      return claim.existing;
    }
    if (claim.kind === "expired") {
      throw new ValidationError("Evidence upload expired.", "UPLOAD_EXPIRED", 422);
    }

    const pending = claim.asset;
    const permanentKey = permanentEvidenceKey(input.tenantId, pending.id, pending.temporaryObjectKey);
    let verification!: { readonly tempEtag: string };
    try {
      verification = await this.verifyTemporaryObject(pending);
    } catch (error) {
      await this.handleTemporaryVerificationFailure(error, input, pending);
    }

    try {
      await this.promoteVerifiedObject(pending, verification.tempEtag, permanentKey);
    } catch (error) {
      await this.handlePromotionRequestFailure(error, input, pending);
    }

    let promotedEtag!: string;
    try {
      promotedEtag = await this.verifyPermanentObject(pending, permanentKey);
    } catch (error) {
      this.handlePostPromotionVerificationFailure(error);
    }

    const created = await this.finalizePromotedEvidence(input, pending, permanentKey, promotedEtag, type, title, description, visibility);
    await this.storage.deleteObject(requireKey(pending.temporaryObjectKey)).catch(() => undefined);
    return created;
  }

  async listEvidence(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly projectId: string;
    readonly limit: number;
    readonly cursor: { readonly createdAt: Date; readonly id: string } | null;
  }): Promise<EvidenceListPage> {
    return this.repository.transaction(async (transaction) => {
      const project = await transaction.findProject(input.tenantId, input.projectId);
      if (project === null) {
        throw new NotFoundError("Project not found.");
      }
      const now = this.clock.now();
      assertEvidencePolicy(input.actor, "evidence.read", project, "P3", now);
      const page = await transaction.listEvidence({
        tenantId: input.tenantId,
        projectId: input.projectId,
        limit: input.limit,
        cursor: input.cursor
      });
      return {
        ...page,
        capabilities: {
          canCreate: canCreateEvidence(input.actor, project, now)
        }
      };
    });
  }

  async createDownloadUrl(input: CreateEvidenceDownloadUrlInput): Promise<{
    readonly url: string;
    readonly expiresAt: Date;
  }> {
    const details = await this.repository.transaction(async (transaction) => {
      const loaded = await transaction.findEvidenceDetails(input.tenantId, input.projectId, input.evidenceId);
      if (loaded === null || loaded.media.uploadStatus !== "VERIFIED" || loaded.media.objectKey === null) {
        throw new NotFoundError("Evidence not found.");
      }
      assertEvidencePolicy(input.actor, "evidence.download", loaded.project, loaded.media.classification, this.clock.now());
      return loaded;
    });
    let signed;
    try {
      signed = await this.storage.createDownloadUrl({
        key: requireKey(details.media.objectKey),
        expiresInSeconds: evidenceDownloadUrlTtlSeconds
      });
    } catch (error) {
      if (error instanceof ObjectStorageError) {
        throw new ApplicationError("Evidence storage unavailable.", "EVIDENCE_STORAGE_UNAVAILABLE", 503);
      }
      throw error;
    }
    await this.repository.transaction(async (transaction) => {
      await transaction.appendAuditEvent(evidenceAuditEvent({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        resourceId: details.evidence.id,
        action: "evidence.download_url_issued",
        actorAccountId: input.actor.account.id,
        requestId: input.requestId,
        metadata: safeEvidenceMetadata(
          details.project.projectId,
          details.media.id,
          details.evidence.id,
          details.media.mime,
          details.media.byteSize,
          details.media.classification
        )
      }));
    });
    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  private async verifyTemporaryObject(asset: MediaAssetRecord): Promise<{
    readonly tempEtag: string;
  }> {
    const tempKey = requireKey(asset.temporaryObjectKey);
    const head = await this.storage.headObject(tempKey);
    if (head === null) {
      throw new ValidationError("Evidence upload object not found.", "OBJECT_NOT_FOUND", 422);
    }
    if (head.contentType !== asset.mime) {
      throw new ValidationError("Evidence upload MIME mismatch.", "MIME_MISMATCH", 422);
    }
    if (head.byteSize !== asset.byteSize) {
      throw new ValidationError("Evidence upload size mismatch.", "SIZE_MISMATCH", 422);
    }
    if (head.etag === null) {
      throw new ApplicationError("Evidence upload ETag is missing.", "EVIDENCE_STORAGE_UNAVAILABLE", 503);
    }
    const bytes = await this.storage.readObjectForVerification({
      key: tempKey,
      expectedEtag: head.etag,
      maxBytes: asset.byteSize
    });
    if (bytes === null) {
      throw new ValidationError("Evidence upload object not found.", "OBJECT_NOT_FOUND", 422);
    }
    if (bytes.length !== asset.byteSize) {
      throw new ValidationError("Evidence upload size mismatch.", "SIZE_MISMATCH", 422);
    }
    domainValidation(() => assertEvidenceMagicBytes(asset.mime, bytes));
    const actualSha256 = await sha256Hex(bytes);
    if (actualSha256 !== asset.sha256) {
      throw new ValidationError("Evidence upload checksum mismatch.", "CHECKSUM_MISMATCH", 422);
    }
    return { tempEtag: head.etag };
  }

  private async promoteVerifiedObject(asset: MediaAssetRecord, sourceEtag: string, permanentKey: string): Promise<void> {
    const tempKey = requireKey(asset.temporaryObjectKey);
    await this.storage.promoteObject({
      sourceKey: tempKey,
      destinationKey: permanentKey,
      sourceEtag,
      contentType: asset.mime
    });
  }

  private async verifyPermanentObject(asset: MediaAssetRecord, permanentKey: string): Promise<string> {
    const promoted = await this.storage.headObject(permanentKey);
    if (promoted === null) {
      throw new ApplicationError("Evidence promotion state is ambiguous.", "EVIDENCE_PROMOTION_AMBIGUOUS", 503);
    }
    if (
      promoted.byteSize !== asset.byteSize ||
      promoted.contentType !== asset.mime ||
      promoted.etag === null
    ) {
      throw new ApplicationError("Evidence promotion state is ambiguous.", "EVIDENCE_PROMOTION_AMBIGUOUS", 503);
    }
    return promoted.etag;
  }

  private async resetVerificationClaim(tenantId: string, projectId: string, assetId: string): Promise<void> {
    await this.repository.transaction(async (transaction) => {
      const asset = await transaction.findMediaAssetForUpdate(tenantId, projectId, assetId);
      if (asset !== null && asset.uploadStatus === "VERIFYING") {
        await transaction.resetMediaAssetVerification({
          tenantId,
          projectId,
          assetId,
          now: this.clock.now()
        });
      }
    });
  }

  private async handleTemporaryVerificationFailure(
    error: unknown,
    input: { readonly tenantId: string; readonly projectId: string; readonly actor: ActorContext; readonly requestId?: string },
    asset: MediaAssetRecord
  ): Promise<never> {
    if (isPrePromotionStorageUnavailableError(error)) {
      await this.resetVerificationClaim(input.tenantId, input.projectId, asset.id);
      throw new ApplicationError("Evidence storage unavailable.", "EVIDENCE_STORAGE_UNAVAILABLE", 503);
    }
    const rejectionCode = rejectionCodeFrom(error);
    await this.rejectAsset(input, asset.id, rejectionCode);
    if (error instanceof ValidationError) {
      throw error;
    }
    if (error instanceof ApplicationError) {
      throw error;
    }
    throw new ValidationError("Evidence upload verification failed.", rejectionCode, 422);
  }

  private async handlePromotionRequestFailure(
    error: unknown,
    input: { readonly tenantId: string; readonly projectId: string; readonly actor: ActorContext; readonly requestId?: string },
    asset: MediaAssetRecord
  ): Promise<never> {
    if (error instanceof ObjectStorageError && error.code === "SIGNING_FAILED") {
      await this.resetVerificationClaim(input.tenantId, input.projectId, asset.id);
      throw new ApplicationError("Evidence storage unavailable.", "EVIDENCE_STORAGE_UNAVAILABLE", 503);
    }
    if (error instanceof ObjectStorageError && error.code === "OBJECT_NOT_FOUND") {
      await this.rejectAsset(input, asset.id, "OBJECT_NOT_FOUND");
      throw new ValidationError("Evidence upload object not found.", "OBJECT_NOT_FOUND", 422);
    }
    if (error instanceof ObjectStorageError && error.code === "SOURCE_CHANGED") {
      await this.rejectAsset(input, asset.id, "SOURCE_CHANGED");
      throw new ValidationError("Evidence upload object changed.", "SOURCE_CHANGED", 422);
    }
    if (error instanceof ObjectStorageError && error.code === "STORAGE_UNAVAILABLE") {
      throw new ApplicationError("Evidence promotion state is ambiguous.", "EVIDENCE_PROMOTION_AMBIGUOUS", 503);
    }
    if (error instanceof ApplicationError && error.code === "EVIDENCE_PROMOTION_AMBIGUOUS") {
      throw error;
    }
    const rejectionCode = rejectionCodeFrom(error);
    await this.rejectAsset(input, asset.id, rejectionCode);
    if (error instanceof ValidationError) {
      throw error;
    }
    if (error instanceof ApplicationError) {
      throw error;
    }
    throw new ValidationError("Evidence upload verification failed.", rejectionCode, 422);
  }

  private handlePostPromotionVerificationFailure(error: unknown): never {
    if (error instanceof ApplicationError && error.code === "EVIDENCE_PROMOTION_AMBIGUOUS") {
      throw error;
    }
    if (error instanceof ObjectStorageError || error instanceof Error) {
      throw new ApplicationError("Evidence promotion state is ambiguous.", "EVIDENCE_PROMOTION_AMBIGUOUS", 503);
    }
    throw new ApplicationError("Evidence promotion state is ambiguous.", "EVIDENCE_PROMOTION_AMBIGUOUS", 503);
  }

  private async finalizePromotedEvidence(
    input: {
      readonly tenantId: string;
      readonly projectId: string;
      readonly actor: ActorContext;
      readonly requestId?: string;
      readonly occurredAt?: Date | null;
    },
    pending: MediaAssetRecord,
    permanentKey: string,
    promotedEtag: string,
    type: EvidenceType,
    title: string,
    description: string | null,
    visibility: EvidenceVisibility
  ): Promise<EvidenceDetails> {
    return await this.repository.transaction(async (transaction) => {
      const project = await transaction.findProjectForUpdate(input.tenantId, input.projectId);
      if (project === null) {
        throw new NotFoundError("Project not found.");
      }
      domainValidation(() => assertUploadableProjectStatus(project.status));
      assertEvidencePolicy(input.actor, "evidence.create", project, pending.classification, this.clock.now());

      const lockedAsset = await transaction.findMediaAssetForUpdate(input.tenantId, input.projectId, pending.id);
      if (lockedAsset === null) {
        throw new NotFoundError("Evidence upload not found.");
      }
      const already = await transaction.findEvidenceByAsset(input.tenantId, input.projectId, pending.id);
      if (lockedAsset.uploadStatus === "VERIFIED" && already !== null) {
        if (
          already.evidence.type === type &&
          already.evidence.title === title &&
          already.evidence.description === description &&
          sameDate(already.evidence.occurredAt, input.occurredAt ?? null) &&
          already.evidence.visibility === visibility
        ) {
          return already;
        }
        throw new ConflictError("Evidence upload was already confirmed with different metadata.");
      }
      if (lockedAsset.uploadStatus !== "VERIFYING") {
        throw new ConflictError("Evidence upload is not pending.");
      }

      const finalized = await transaction.finalizeMediaAssetVerification({
        tenantId: input.tenantId,
        projectId: input.projectId,
        assetId: pending.id,
        objectKey: permanentKey,
        etag: promotedEtag,
        now: this.clock.now()
      });
      if (finalized === null) {
        throw new ConflictError("Evidence upload changed concurrently.");
      }

      const evidence = await transaction.insertEvidence({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        projectId: input.projectId,
        mediaAssetId: lockedAsset.id,
        type,
        title,
        description,
        occurredAt: input.occurredAt ?? null,
        visibility,
        createdByAccountId: input.actor.account.id
      });
      await transaction.appendAuditEvent(evidenceAuditEvent({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        resourceId: lockedAsset.id,
        action: "evidence.upload_verified",
        actorAccountId: input.actor.account.id,
        requestId: input.requestId,
        metadata: safeEvidenceMetadata(input.projectId, lockedAsset.id, evidence.id, pending.mime, pending.byteSize, pending.classification)
      }));
      await transaction.appendAuditEvent(evidenceAuditEvent({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        resourceId: evidence.id,
        action: "evidence.created",
        actorAccountId: input.actor.account.id,
        requestId: input.requestId,
        metadata: safeEvidenceMetadata(input.projectId, lockedAsset.id, evidence.id, pending.mime, pending.byteSize, pending.classification)
      }));
      const details = await transaction.findEvidenceDetails(input.tenantId, input.projectId, evidence.id);
      if (details === null) {
        throw new Error("Expected created evidence.");
      }
      return details;
    });
  }

  private async rejectAsset(
    input: { readonly tenantId: string; readonly projectId: string; readonly actor: ActorContext; readonly requestId?: string },
    assetId: string,
    code: EvidenceRejectionCode
  ): Promise<void> {
    await this.repository.transaction(async (transaction) => {
      const rejected = await transaction.markMediaAssetRejected({
        tenantId: input.tenantId,
        assetId,
        status: code,
        now: this.clock.now()
      });
      if (rejected !== null) {
        await transaction.appendAuditEvent(evidenceAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceId: assetId,
          action: "evidence.upload_rejected",
          actorAccountId: input.actor.account.id,
          requestId: input.requestId,
          metadata: {
            project_id: input.projectId,
            asset_id: assetId,
            rejection_code: code
          }
        }));
      }
    });
  }
}

type EvidenceAction = "evidence.create" | "evidence.read" | "evidence.download";

function assertEvidencePolicy(
  actor: ActorContext,
  action: EvidenceAction,
  project: EvidenceProjectResource,
  classification: EvidenceClassification,
  now: Date
): void {
  const resource: EvidenceResource = {
    tenantId: project.tenantId,
    projectId: project.projectId,
    ownerOrganizationId: project.ownerOrganizationId,
    ownerOrganizationPath: project.ownerOrganizationPath,
    projectStatus: project.status,
    classification,
    createdByAccountId: project.createdByAccountId
  };
  const decision = canAccessEvidence(actor, action, resource, { now });
  if (decision.effect === "deny") {
    throw new ValidationError("Permission denied.", decision.reasonCode, 403);
  }
}

function canCreateEvidence(actor: ActorContext, project: EvidenceProjectResource, now: Date): boolean {
  if (!["DRAFT", "CHANGES_REQUESTED", "APPROVED_FOR_EXECUTION"].includes(project.status)) {
    return false;
  }
  return canAccessEvidence(actor, "evidence.create", {
    tenantId: project.tenantId,
    projectId: project.projectId,
    ownerOrganizationId: project.ownerOrganizationId,
    ownerOrganizationPath: project.ownerOrganizationPath,
    projectStatus: project.status,
    classification: "P3",
    createdByAccountId: project.createdByAccountId
  }, { now }).effect === "allow";
}

function temporaryEvidenceKey(tenantId: string, assetId: string, nonce: string): string {
  return `tmp/evidence/${tenantId}/${assetId}/${nonce}`;
}

function permanentEvidenceKey(tenantId: string, assetId: string, temporaryObjectKey: string | null): string {
  const nonce = requireKey(temporaryObjectKey).split("/").at(-1);
  if (nonce === undefined || nonce.length === 0) {
    throw new Error("Invalid temporary object key.");
  }
  return `evidence/${tenantId}/${assetId}/${nonce}`;
}

function requireKey(key: string | null): string {
  if (key === null || key.length === 0) {
    throw new Error("Object key is missing.");
  }
  return key;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEvidenceMetadata(
  projectId: string,
  assetId: string,
  evidenceId: string | null,
  mime: EvidenceMime,
  byteSize: number,
  classification: EvidenceClassification
): Record<string, unknown> {
  return {
    project_id: projectId,
    asset_id: assetId,
    evidence_id: evidenceId,
    mime,
    byte_size: byteSize,
    classification
  };
}

function evidenceAuditEvent(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceId: string;
  readonly action: EvidenceAuditAction;
  readonly metadata: Record<string, unknown>;
  readonly requestId?: string;
  readonly actorAccountId: string;
}) {
  return createAuditEvent({
    id: input.id,
    tenantId: input.tenantId,
    resourceType: "evidence",
    resourceId: input.resourceId,
    action: input.action,
    metadata: input.metadata,
    requestId: input.requestId,
    auditActor: { kind: "USER", id: input.actorAccountId }
  });
}

function rejectionCodeFrom(error: unknown): EvidenceRejectionCode {
  if (error instanceof ObjectStorageError) {
    if (error.code === "SOURCE_CHANGED") {
      return "SOURCE_CHANGED";
    }
    if (error.code === "OBJECT_NOT_FOUND") {
      return "OBJECT_NOT_FOUND";
    }
  }
  if (error instanceof EvidenceDomainError) {
    return error.code === "MAGIC_BYTES_MISMATCH" ? "MAGIC_BYTES_MISMATCH" : "MIME_MISMATCH";
  }
  if (error instanceof ValidationError && isEvidenceRejectionCode(error.code)) {
    return error.code;
  }
  return "PROMOTION_FAILED";
}

function isPrePromotionStorageUnavailableError(error: unknown): boolean {
  return (error instanceof ObjectStorageError &&
    (error.code === "SIGNING_FAILED" || error.code === "STORAGE_UNAVAILABLE")) ||
    (error instanceof ApplicationError && error.code === "EVIDENCE_STORAGE_UNAVAILABLE");
}

function isEvidenceRejectionCode(code: string): code is EvidenceRejectionCode {
  return [
    "OBJECT_NOT_FOUND",
    "SIZE_MISMATCH",
    "CHECKSUM_MISMATCH",
    "MAGIC_BYTES_MISMATCH",
    "MIME_MISMATCH",
    "UPLOAD_EXPIRED",
    "SOURCE_CHANGED",
    "PROMOTION_FAILED",
    "UPLOAD_SIGNING_FAILED"
  ].includes(code);
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return (left?.toISOString() ?? null) === (right?.toISOString() ?? null);
}

function domainValidation<TResult>(operation: () => TResult): TResult {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EvidenceDomainError) {
      throw new ValidationError(error.message, error.code, 422);
    }
    throw error;
  }
}
