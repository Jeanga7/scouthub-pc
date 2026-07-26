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
  type EvidenceType
} from "@scouthub/domain";
import { canAccessEvidence, type EvidenceResource } from "@scouthub/authz";
import type { ActorContext } from "../ports/identity-repository";
import type { ObjectStorage } from "../ports/object-storage";
import { createAuditEvent, type EvidenceAuditAction, type RequestContext } from "../organization/audit";
import { ConflictError, NotFoundError, ValidationError } from "../organization/errors";
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
        checksumSha256Base64: sha256HexToBase64(asset.sha256),
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
      await this.rejectAsset(input, asset.id, "UPLOAD_SIGNING_FAILED");
      throw error;
    }
  }

  async confirmEvidenceUpload(input: ConfirmEvidenceUploadInput): Promise<EvidenceDetails> {
    const type = domainValidation(() => assertSlice5EvidenceType(input.type));
    const title = domainValidation(() => normalizeEvidenceTitle(input.title));
    const description = domainValidation(() => normalizeEvidenceDescription(input.description));
    const visibility = domainValidation(() => assertEvidenceVisibility(input.visibility));

    const existing = await this.repository.transaction((transaction) =>
      transaction.findEvidenceByAsset(input.tenantId, input.projectId, input.assetId)
    );
    if (existing !== null) {
      if (
        existing.evidence.type === type &&
        existing.evidence.title === title &&
        existing.evidence.description === description &&
        sameDate(existing.evidence.occurredAt, input.occurredAt ?? null) &&
        existing.evidence.visibility === visibility
      ) {
        return existing;
      }
      throw new ConflictError("Evidence upload was already confirmed with different metadata.");
    }

    const pending = await this.repository.transaction((transaction) =>
      transaction.findMediaAsset(input.tenantId, input.projectId, input.assetId)
    );
    if (pending === null) {
      throw new NotFoundError("Evidence upload not found.");
    }
    if (pending.uploadStatus !== "PENDING_UPLOAD") {
      throw new ConflictError("Evidence upload is not pending.");
    }
    if (pending.uploadExpiresAt <= this.clock.now()) {
      await this.rejectAsset(input, pending.id, "UPLOAD_EXPIRED");
      throw new ValidationError("Evidence upload expired.", "UPLOAD_EXPIRED", 422);
    }
    domainValidation(() => assertEvidenceMimeMatchesType(type, pending.mime));

    const permanentKey = permanentEvidenceKey(input.tenantId, pending.id, pending.temporaryObjectKey);
    let promotedEtag: string | null;
    try {
      promotedEtag = await this.verifyAndPromoteObject(pending, permanentKey);
    } catch (error) {
      const rejectionCode = rejectionCodeFrom(error);
      await this.rejectAsset(input, pending.id, rejectionCode);
      await this.storage.deleteObject(requireKey(pending.temporaryObjectKey)).catch(() => undefined);
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError("Evidence upload verification failed.", rejectionCode, 422);
    }

    let created: EvidenceDetails;
    try {
      created = await this.repository.transaction(async (transaction) => {
        const project = await transaction.findProjectForUpdate(input.tenantId, input.projectId);
        if (project === null) {
          throw new NotFoundError("Project not found.");
        }
        domainValidation(() => assertUploadableProjectStatus(project.status));
        assertEvidencePolicy(input.actor, "evidence.create", project, pending.classification, this.clock.now());
        const lockedAsset = await transaction.findMediaAssetForUpdate(input.tenantId, input.projectId, input.assetId);
        if (lockedAsset === null) {
          throw new NotFoundError("Evidence upload not found.");
        }
        if (lockedAsset.uploadStatus !== "PENDING_UPLOAD") {
          const already = await transaction.findEvidenceByAsset(input.tenantId, input.projectId, input.assetId);
          if (lockedAsset.uploadStatus === "VERIFIED" && already !== null) {
            return already;
          }
          throw new ConflictError("Evidence upload is not pending.");
        }
        const verified = await transaction.verifyMediaAsset({
          tenantId: input.tenantId,
          projectId: input.projectId,
          assetId: input.assetId,
          objectKey: permanentKey,
          etag: promotedEtag,
          now: this.clock.now()
        });
        if (verified === null) {
          throw new ConflictError("Evidence upload changed concurrently.");
        }
        const evidence = await transaction.insertEvidence({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          projectId: input.projectId,
          mediaAssetId: input.assetId,
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
          resourceId: input.assetId,
          action: "evidence.upload_verified",
          actorAccountId: input.actor.account.id,
          requestId: input.requestId,
          metadata: safeEvidenceMetadata(input.projectId, input.assetId, evidence.id, verified.mime, verified.byteSize, verified.classification)
        }));
        await transaction.appendAuditEvent(evidenceAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceId: evidence.id,
          action: "evidence.created",
          actorAccountId: input.actor.account.id,
          requestId: input.requestId,
          metadata: safeEvidenceMetadata(input.projectId, input.assetId, evidence.id, verified.mime, verified.byteSize, verified.classification)
        }));
        const details = await transaction.findEvidenceDetails(input.tenantId, input.projectId, evidence.id);
        if (details === null) {
          throw new Error("Expected created evidence.");
        }
        return details;
      });
    } catch (dbError) {
      // Object storage and PostgreSQL are not atomic. If the permanent copy
      // exists but DB finalization fails, cleanup is best-effort and the DB
      // error remains the authoritative failure.
      await this.storage.deleteObject(permanentKey).catch(() => undefined);
      throw dbError;
    }
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
      assertEvidencePolicy(input.actor, "evidence.read", project, "P3", this.clock.now());
      return transaction.listEvidence({
        tenantId: input.tenantId,
        projectId: input.projectId,
        limit: input.limit,
        cursor: input.cursor
      });
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
      await transaction.appendAuditEvent(evidenceAuditEvent({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        resourceId: loaded.evidence.id,
        action: "evidence.download_url_issued",
        actorAccountId: input.actor.account.id,
        requestId: input.requestId,
        metadata: safeEvidenceMetadata(
          loaded.project.projectId,
          loaded.media.id,
          loaded.evidence.id,
          loaded.media.mime,
          loaded.media.byteSize,
          loaded.media.classification
        )
      }));
      return loaded;
    });
    const signed = await this.storage.createDownloadUrl({
      key: requireKey(details.media.objectKey),
      expiresInSeconds: evidenceDownloadUrlTtlSeconds
    });
    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  private async verifyAndPromoteObject(asset: MediaAssetRecord, permanentKey: string): Promise<string | null> {
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
    if (head.checksumSha256Base64 !== sha256HexToBase64(asset.sha256)) {
      throw new ValidationError("Evidence upload checksum mismatch.", "CHECKSUM_MISMATCH", 422);
    }
    if (head.etag === null) {
      throw new ValidationError("Evidence upload ETag is missing.", "PROMOTION_FAILED", 422);
    }
    // R2 has verified the checksum header for the full object. Magic-byte
    // inspection covers the remaining trust boundary: MIME/extension spoofing.
    const prefix = await this.storage.readObjectPrefix(tempKey, 16);
    if (prefix === null) {
      throw new ValidationError("Evidence upload object not found.", "OBJECT_NOT_FOUND", 422);
    }
    domainValidation(() => assertEvidenceMagicBytes(asset.mime, prefix));
    await this.storage.promoteObject({
      sourceKey: tempKey,
      destinationKey: permanentKey,
      sourceEtag: head.etag,
      contentType: asset.mime
    });
    const promoted = await this.storage.headObject(permanentKey);
    if (
      promoted === null ||
      promoted.byteSize !== asset.byteSize ||
      promoted.contentType !== asset.mime ||
      promoted.checksumSha256Base64 !== sha256HexToBase64(asset.sha256)
    ) {
      throw new ValidationError("Evidence promotion failed.", "PROMOTION_FAILED", 422);
    }
    return promoted.etag;
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

function sha256HexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}

function requireKey(key: string | null): string {
  if (key === null || key.length === 0) {
    throw new Error("Object key is missing.");
  }
  return key;
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
  if (error instanceof EvidenceDomainError) {
    return error.code === "MAGIC_BYTES_MISMATCH" ? "MAGIC_BYTES_MISMATCH" : "MIME_MISMATCH";
  }
  if (error instanceof ValidationError && isEvidenceRejectionCode(error.code)) {
    return error.code;
  }
  return "PROMOTION_FAILED";
}

function isEvidenceRejectionCode(code: string): code is EvidenceRejectionCode {
  return [
    "OBJECT_NOT_FOUND",
    "SIZE_MISMATCH",
    "CHECKSUM_MISMATCH",
    "MAGIC_BYTES_MISMATCH",
    "MIME_MISMATCH",
    "UPLOAD_EXPIRED",
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
