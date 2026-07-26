import type { ActorContext, EvidenceDetails, EvidenceUseCases } from "@scouthub/application";
import { ValidationError } from "@scouthub/application";
import { canAccessEvidence } from "@scouthub/authz";
import {
  createEvidenceDownloadUrlResponseSchema,
  evidenceListResponseSchema,
  evidenceResponseSchema,
  uuidSchema,
  type ConfirmEvidenceUploadRequest,
  type CreateEvidenceDownloadUrlRequest,
  type EvidenceListResponse,
  type EvidenceResponse,
  type InitiateEvidenceUploadRequest,
  type InitiateEvidenceUploadResponse
} from "@scouthub/contracts";
import { z } from "zod";
import { requireActor } from "@/identity/http";
import { handleRouteError, jsonResponse, requestId } from "@/organizations/http";

export { handleRouteError, jsonResponse, requestId };

export async function requireEvidenceActor(
  request: Request,
  currentRequestId: string
): Promise<ActorContext> {
  return requireActor(request, currentRequestId);
}

type InitiateEvidenceUploadUseCaseInput = Parameters<
  EvidenceUseCases["initiateEvidenceUpload"]
>[0];
type ConfirmEvidenceUploadUseCaseInput = Parameters<
  EvidenceUseCases["confirmEvidenceUpload"]
>[0];
type CreateEvidenceDownloadUrlUseCaseInput = Parameters<
  EvidenceUseCases["createDownloadUrl"]
>[0];

export function mapInitiateUploadRequest(input: {
  readonly actor: ActorContext;
  readonly projectId: string;
  readonly payload: InitiateEvidenceUploadRequest;
  readonly requestId: string;
}): InitiateEvidenceUploadUseCaseInput {
  return {
    actor: input.actor,
    tenantId: input.payload.tenantId,
    projectId: input.projectId,
    filename: input.payload.filename,
    mime: input.payload.mime,
    bytes: input.payload.bytes,
    sha256: input.payload.sha256,
    requestId: input.requestId,
    ...(input.payload.classification !== undefined && { classification: input.payload.classification })
  };
}

export function mapConfirmUploadRequest(input: {
  readonly actor: ActorContext;
  readonly projectId: string;
  readonly assetId: string;
  readonly payload: ConfirmEvidenceUploadRequest;
  readonly requestId: string;
}): ConfirmEvidenceUploadUseCaseInput {
  return {
    actor: input.actor,
    tenantId: input.payload.tenantId,
    projectId: input.projectId,
    assetId: input.assetId,
    type: input.payload.type,
    title: input.payload.title,
    requestId: input.requestId,
    ...(input.payload.description !== undefined && { description: input.payload.description }),
    ...(input.payload.occurredAt !== undefined && {
      occurredAt: input.payload.occurredAt === null ? null : new Date(input.payload.occurredAt)
    }),
    ...(input.payload.visibility !== undefined && { visibility: input.payload.visibility })
  };
}

export function mapDownloadUrlRequest(input: {
  readonly actor: ActorContext;
  readonly projectId: string;
  readonly evidenceId: string;
  readonly payload: CreateEvidenceDownloadUrlRequest;
  readonly requestId: string;
}): CreateEvidenceDownloadUrlUseCaseInput {
  return {
    actor: input.actor,
    tenantId: input.payload.tenantId,
    projectId: input.projectId,
    evidenceId: input.evidenceId,
    requestId: input.requestId
  };
}

export function mapInitiateUploadResponse(input: {
  readonly asset: { readonly id: string };
  readonly upload: {
    readonly url: string;
    readonly method: "PUT";
    readonly expiresAt: Date;
    readonly requiredHeaders: Record<string, string>;
  };
}): InitiateEvidenceUploadResponse {
  return {
    assetId: input.asset.id,
    upload: {
      url: input.upload.url,
      method: input.upload.method,
      expiresAt: input.upload.expiresAt.toISOString(),
      requiredHeaders: input.upload.requiredHeaders
    }
  };
}

export function mapEvidence(details: EvidenceDetails, actor?: ActorContext): EvidenceResponse {
  return evidenceResponseSchema.parse({
    id: details.evidence.id,
    projectId: details.evidence.projectId,
    type: details.evidence.type,
    title: details.evidence.title,
    description: details.evidence.description,
    occurredAt: details.evidence.occurredAt?.toISOString() ?? null,
    visibility: details.evidence.visibility,
    validationStatus: details.evidence.validationStatus,
    classification: details.media.classification,
    media: {
      id: details.media.id,
      mime: details.media.mime,
      bytes: details.media.byteSize,
      sha256: details.media.sha256,
      scanStatus: details.media.scanStatus
    },
    createdByAccountId: details.evidence.createdByAccountId,
    createdAt: details.evidence.createdAt.toISOString(),
    ...(actor !== undefined && {
      capabilities: {
        canDownload: canAccessEvidence(actor, "evidence.download", {
          tenantId: details.project.tenantId,
          projectId: details.project.projectId,
          ownerOrganizationId: details.project.ownerOrganizationId,
          ownerOrganizationPath: details.project.ownerOrganizationPath,
          projectStatus: details.project.status,
          classification: details.media.classification,
          createdByAccountId: details.evidence.createdByAccountId
        }, { now: new Date() }).effect === "allow"
      }
    })
  });
}

export function mapEvidenceList(input: {
  readonly items: readonly EvidenceDetails[];
  readonly nextCursor: string | null;
  readonly actor: ActorContext;
}): EvidenceListResponse {
  return evidenceListResponseSchema.parse({
    items: input.items.map((item) => mapEvidence(item, input.actor)),
    nextCursor: input.nextCursor
  });
}

export function mapDownloadUrlResponse(input: { readonly url: string; readonly expiresAt: Date }) {
  return createEvidenceDownloadUrlResponseSchema.parse({
    url: input.url,
    expiresAt: input.expiresAt.toISOString()
  });
}

const evidenceCursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: uuidSchema
}).strict();

export function encodeEvidenceCursor(cursor: {
  readonly createdAt: Date;
  readonly id: string;
} | null): string | null {
  if (cursor === null) {
    return null;
  }
  return Buffer.from(JSON.stringify({
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id
  }), "utf8").toString("base64url");
}

export function decodeEvidenceCursor(value: string | undefined): {
  readonly createdAt: Date;
  readonly id: string;
} | null {
  if (value === undefined) {
    return null;
  }
  try {
    const parsed = evidenceCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    );
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new ValidationError("Evidence cursor is invalid.", "EVIDENCE_CURSOR_INVALID", 400);
  }
}
