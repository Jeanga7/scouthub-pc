import type {
  EvidenceClassification,
  EvidenceMime,
  EvidenceRejectionCode,
  EvidenceScanStatus,
  EvidenceType,
  EvidenceUploadStatus,
  EvidenceValidationStatus,
  EvidenceVisibility,
  ProjectStatus
} from "@scouthub/domain";
import type { AuditEventInput } from "../organization/audit";

export interface EvidenceProjectResource {
  readonly projectId: string;
  readonly tenantId: string;
  readonly status: ProjectStatus;
  readonly createdByAccountId: string;
  readonly ownerOrganizationId: string;
  readonly ownerOrganizationPath: string;
  readonly ownerOrganizationType: "GROUP" | "UNIT";
  readonly ownerOrganizationStatus: "ACTIVE" | "DRAFT";
}

export interface MediaAssetRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly temporaryObjectKey: string | null;
  readonly objectKey: string | null;
  readonly mime: EvidenceMime;
  readonly byteSize: number;
  readonly sha256: string;
  readonly etag: string | null;
  readonly classification: EvidenceClassification;
  readonly uploadStatus: EvidenceUploadStatus;
  readonly scanStatus: EvidenceScanStatus;
  readonly uploadedByAccountId: string;
  readonly uploadExpiresAt: Date;
  readonly verifiedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly rejectionCode: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EvidenceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly mediaAssetId: string;
  readonly type: EvidenceType;
  readonly title: string;
  readonly description: string | null;
  readonly occurredAt: Date | null;
  readonly visibility: EvidenceVisibility;
  readonly validationStatus: EvidenceValidationStatus;
  readonly createdByAccountId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EvidenceDetails {
  readonly evidence: EvidenceRecord;
  readonly media: MediaAssetRecord;
  readonly project: EvidenceProjectResource;
}

export interface EvidenceCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface EvidenceListPage {
  readonly items: readonly EvidenceDetails[];
  readonly nextCursor: EvidenceCursor | null;
  readonly capabilities?: {
    readonly canCreate: boolean;
  };
}

export interface MediaAssetInsert {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly temporaryObjectKey: string;
  readonly mime: EvidenceMime;
  readonly byteSize: number;
  readonly sha256: string;
  readonly classification: EvidenceClassification;
  readonly uploadedByAccountId: string;
  readonly uploadExpiresAt: Date;
}

export interface EvidenceInsert {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly mediaAssetId: string;
  readonly type: EvidenceType;
  readonly title: string;
  readonly description: string | null;
  readonly occurredAt: Date | null;
  readonly visibility: EvidenceVisibility;
  readonly createdByAccountId: string;
}

export interface EvidenceTransaction {
  findProject(tenantId: string, projectId: string): Promise<EvidenceProjectResource | null>;
  findProjectForUpdate(tenantId: string, projectId: string): Promise<EvidenceProjectResource | null>;
  countPendingUploadsForAccount(input: {
    readonly tenantId: string;
    readonly accountId: string;
    readonly now: Date;
  }): Promise<number>;
  insertMediaAsset(input: MediaAssetInsert): Promise<MediaAssetRecord>;
  markMediaAssetRejected(input: {
    readonly tenantId: string;
    readonly assetId: string;
    readonly status: EvidenceRejectionCode;
    readonly now: Date;
  }): Promise<MediaAssetRecord | null>;
  claimMediaAssetForVerification(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly assetId: string;
    readonly now: Date;
  }): Promise<MediaAssetRecord | null>;
  findMediaAsset(tenantId: string, projectId: string, assetId: string): Promise<MediaAssetRecord | null>;
  findMediaAssetForUpdate(tenantId: string, projectId: string, assetId: string): Promise<MediaAssetRecord | null>;
  findEvidenceByAsset(tenantId: string, projectId: string, assetId: string): Promise<EvidenceDetails | null>;
  finalizeMediaAssetVerification(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly assetId: string;
    readonly objectKey: string;
    readonly etag: string | null;
    readonly now: Date;
  }): Promise<MediaAssetRecord | null>;
  resetMediaAssetVerification(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly assetId: string;
    readonly now: Date;
  }): Promise<MediaAssetRecord | null>;
  insertEvidence(input: EvidenceInsert): Promise<EvidenceRecord>;
  findEvidenceDetails(tenantId: string, projectId: string, evidenceId: string): Promise<EvidenceDetails | null>;
  listEvidence(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly limit: number;
    readonly cursor: EvidenceCursor | null;
  }): Promise<EvidenceListPage>;
  appendAuditEvent(input: AuditEventInput): Promise<void>;
}

export interface EvidenceRepository {
  transaction<TResult>(
    handler: (transaction: EvidenceTransaction) => Promise<TResult>
  ): Promise<TResult>;
}
