// pg resolves this package through the workerd condition for Cloudflare sockets.
import "pg-cloudflare";
import pg from "pg";
import type { QueryResultRow } from "pg";
import type {
  AuditEventInput,
  EvidenceDetails,
  EvidenceInsert,
  EvidenceListPage,
  EvidenceProjectResource,
  EvidenceRecord,
  EvidenceRepository,
  EvidenceTransaction,
  MediaAssetInsert,
  MediaAssetRecord
} from "@scouthub/application";
import { ConflictError } from "@scouthub/application";
import type {
  EvidenceClassification,
  EvidenceMime,
  EvidenceScanStatus,
  EvidenceType,
  EvidenceUploadStatus,
  EvidenceValidationStatus,
  EvidenceVisibility,
  ProjectStatus
} from "@scouthub/domain";

interface Queryable {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ readonly rows: TRow[]; readonly rowCount?: number | null }>;
}

type ProjectResourceRow = QueryResultRow & {
  project_id: string;
  tenant_id: string;
  status: ProjectStatus;
  created_by_account_id: string;
  owner_org_id: string;
  owner_path: string;
  owner_type: "GROUP" | "UNIT";
  owner_status: "ACTIVE" | "DRAFT";
};

type MediaAssetRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  project_id: string;
  temporary_object_key: string | null;
  object_key: string | null;
  mime: EvidenceMime;
  byte_size: number;
  sha256: string;
  etag: string | null;
  classification: EvidenceClassification;
  upload_status: EvidenceUploadStatus;
  scan_status: EvidenceScanStatus;
  uploaded_by_account_id: string;
  upload_expires_at: Date;
  verified_at: Date | null;
  rejected_at: Date | null;
  rejection_code: string | null;
  width: number | null;
  height: number | null;
  created_at: Date;
  updated_at: Date;
};

type EvidenceRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  project_id: string;
  media_asset_id: string;
  type: EvidenceType;
  title: string;
  description: string | null;
  occurred_at: Date | null;
  visibility: EvidenceVisibility;
  validation_status: EvidenceValidationStatus;
  created_by_account_id: string;
  created_at: Date;
  updated_at: Date;
};

type EvidenceDetailsRow = EvidenceRow & {
  media_id: string;
  media_tenant_id: string;
  media_project_id: string;
  temporary_object_key: string | null;
  object_key: string | null;
  mime: EvidenceMime;
  byte_size: number;
  sha256: string;
  etag: string | null;
  classification: EvidenceClassification;
  upload_status: EvidenceUploadStatus;
  scan_status: EvidenceScanStatus;
  uploaded_by_account_id: string;
  upload_expires_at: Date;
  verified_at: Date | null;
  rejected_at: Date | null;
  rejection_code: string | null;
  width: number | null;
  height: number | null;
  media_created_at: Date;
  media_updated_at: Date;
  project_status: ProjectStatus;
  project_created_by_account_id: string;
  owner_org_id: string;
  owner_path: string;
  owner_type: "GROUP" | "UNIT";
  owner_status: "ACTIVE" | "DRAFT";
};

export function createPgEvidenceRepository(databaseUrl: string): EvidenceRepository {
  return new PgEvidenceRepository(databaseUrl);
}

class PgEvidenceRepository implements EvidenceRepository {
  constructor(private readonly databaseUrl: string) {}

  async transaction<TResult>(
    handler: (transaction: EvidenceTransaction) => Promise<TResult>
  ): Promise<TResult> {
    const pool = new pg.Pool({ connectionString: this.databaseUrl, max: 1 });
    try {
      await pool.query("BEGIN");
      const result = await handler(new PgEvidenceTransaction(pool));
      await pool.query("COMMIT");
      return result;
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    } finally {
      await pool.end();
    }
  }
}

class PgEvidenceTransaction implements EvidenceTransaction {
  constructor(private readonly db: Queryable) {}

  async findProject(tenantId: string, projectId: string): Promise<EvidenceProjectResource | null> {
    const result = await this.db.query<ProjectResourceRow>(
      `${projectResourceSelect()}
       WHERE p.tenant_id = $1 AND p.id = $2
       LIMIT 1`,
      [tenantId, projectId]
    );
    return result.rows[0] === undefined ? null : mapProjectResource(result.rows[0]);
  }

  async findProjectForUpdate(tenantId: string, projectId: string): Promise<EvidenceProjectResource | null> {
    const result = await this.db.query<ProjectResourceRow>(
      `${projectResourceSelect()}
       WHERE p.tenant_id = $1 AND p.id = $2
       FOR UPDATE OF p`,
      [tenantId, projectId]
    );
    return result.rows[0] === undefined ? null : mapProjectResource(result.rows[0]);
  }

  async countPendingUploadsForAccount(input: {
    readonly tenantId: string;
    readonly accountId: string;
    readonly now: Date;
  }): Promise<number> {
    const result = await this.db.query<QueryResultRow & { count: string }>(
      `SELECT count(*)::text AS count
       FROM media_asset
       WHERE tenant_id = $1
         AND uploaded_by_account_id = $2
         AND upload_status = 'PENDING_UPLOAD'
         AND upload_expires_at > $3`,
      [input.tenantId, input.accountId, input.now]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async insertMediaAsset(input: MediaAssetInsert): Promise<MediaAssetRecord> {
    const result = await this.db.query<MediaAssetRow>(
      `INSERT INTO media_asset (
        id, tenant_id, project_id, temporary_object_key, mime, byte_size,
        sha256, classification, uploaded_by_account_id, upload_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::evidence_classification, $9, $10)
      RETURNING *`,
      [
        input.id,
        input.tenantId,
        input.projectId,
        input.temporaryObjectKey,
        input.mime,
        input.byteSize,
        input.sha256,
        input.classification,
        input.uploadedByAccountId,
        input.uploadExpiresAt
      ]
    );
    return mapMediaAsset(requireRow(result.rows[0], "Expected created media asset."));
  }

  async markMediaAssetRejected(input: {
    readonly tenantId: string;
    readonly assetId: string;
    readonly status: string;
    readonly now: Date;
  }): Promise<MediaAssetRecord | null> {
    const result = await this.db.query<MediaAssetRow>(
      `UPDATE media_asset
       SET upload_status = 'REJECTED',
           rejected_at = $3,
           rejection_code = $4,
           updated_at = now()
       WHERE tenant_id = $1
         AND id = $2
         AND upload_status IN ('PENDING_UPLOAD', 'VERIFYING')
       RETURNING *`,
      [input.tenantId, input.assetId, input.now, input.status]
    );
    return result.rows[0] === undefined ? null : mapMediaAsset(result.rows[0]);
  }

  async findMediaAsset(tenantId: string, projectId: string, assetId: string): Promise<MediaAssetRecord | null> {
    const result = await this.db.query<MediaAssetRow>(
      `SELECT * FROM media_asset
       WHERE tenant_id = $1 AND project_id = $2 AND id = $3
       LIMIT 1`,
      [tenantId, projectId, assetId]
    );
    return result.rows[0] === undefined ? null : mapMediaAsset(result.rows[0]);
  }

  async findMediaAssetForUpdate(tenantId: string, projectId: string, assetId: string): Promise<MediaAssetRecord | null> {
    const result = await this.db.query<MediaAssetRow>(
      `SELECT * FROM media_asset
       WHERE tenant_id = $1 AND project_id = $2 AND id = $3
       FOR UPDATE`,
      [tenantId, projectId, assetId]
    );
    return result.rows[0] === undefined ? null : mapMediaAsset(result.rows[0]);
  }

  async findEvidenceByAsset(tenantId: string, projectId: string, assetId: string): Promise<EvidenceDetails | null> {
    const result = await this.db.query<EvidenceDetailsRow>(
      `${evidenceDetailsSelect()}
       WHERE e.tenant_id = $1 AND e.project_id = $2 AND e.media_asset_id = $3
       LIMIT 1`,
      [tenantId, projectId, assetId]
    );
    return result.rows[0] === undefined ? null : mapEvidenceDetails(result.rows[0]);
  }

  async verifyMediaAsset(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly assetId: string;
    readonly objectKey: string;
    readonly etag: string | null;
    readonly now: Date;
  }): Promise<MediaAssetRecord | null> {
    const result = await this.db.query<MediaAssetRow>(
      `UPDATE media_asset
       SET upload_status = 'VERIFIED',
           object_key = $4,
           etag = COALESCE($5, etag),
           verified_at = $6,
           updated_at = now()
       WHERE tenant_id = $1
         AND project_id = $2
         AND id = $3
         AND upload_status = 'PENDING_UPLOAD'
       RETURNING *`,
      [input.tenantId, input.projectId, input.assetId, input.objectKey, input.etag, input.now]
    );
    return result.rows[0] === undefined ? null : mapMediaAsset(result.rows[0]);
  }

  async insertEvidence(input: EvidenceInsert): Promise<EvidenceRecord> {
    const result = await catchEvidenceConflict(() =>
      this.db.query<EvidenceRow>(
        `INSERT INTO evidence (
          id, tenant_id, project_id, media_asset_id, type, title,
          description, occurred_at, visibility, created_by_account_id
        )
        VALUES ($1, $2, $3, $4, $5::evidence_type, $6, $7, $8, $9::evidence_visibility, $10)
        RETURNING *`,
        [
          input.id,
          input.tenantId,
          input.projectId,
          input.mediaAssetId,
          input.type,
          input.title,
          input.description,
          input.occurredAt,
          input.visibility,
          input.createdByAccountId
        ]
      )
    );
    return mapEvidence(requireRow(result.rows[0], "Expected created evidence."));
  }

  async findEvidenceDetails(tenantId: string, projectId: string, evidenceId: string): Promise<EvidenceDetails | null> {
    const result = await this.db.query<EvidenceDetailsRow>(
      `${evidenceDetailsSelect()}
       WHERE e.tenant_id = $1 AND e.project_id = $2 AND e.id = $3
       LIMIT 1`,
      [tenantId, projectId, evidenceId]
    );
    return result.rows[0] === undefined ? null : mapEvidenceDetails(result.rows[0]);
  }

  async listEvidence(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly limit: number;
    readonly cursor: { readonly createdAt: Date; readonly id: string } | null;
  }): Promise<EvidenceListPage> {
    const values: unknown[] = [input.tenantId, input.projectId, input.limit + 1];
    const predicates = ["e.tenant_id = $1", "e.project_id = $2"];
    if (input.cursor !== null) {
      values.push(input.cursor.createdAt, input.cursor.id);
      predicates.push(`(e.created_at, e.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    const result = await this.db.query<EvidenceDetailsRow>(
      `${evidenceDetailsSelect()}
       WHERE ${predicates.join(" AND ")}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $3`,
      values
    );
    const rows = result.rows.slice(0, input.limit);
    const last = rows.at(-1);
    return {
      items: rows.map(mapEvidenceDetails),
      nextCursor: result.rows.length > input.limit && last !== undefined
        ? { createdAt: last.created_at, id: last.id }
        : null
    };
  }

  async appendAuditEvent(input: AuditEventInput): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_event (
        id, tenant_id, resource_type, resource_id, action, actor_kind,
        actor_id, request_id, metadata, occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::audit_actor_kind, $7, $8, $9, $10)`,
      [
        input.id,
        input.tenantId,
        input.resourceType,
        input.resourceId,
        input.action,
        input.actorKind,
        input.actorId,
        input.requestId,
        input.metadata,
        input.occurredAt
      ]
    );
  }
}

function projectResourceSelect(): string {
  return `SELECT p.id AS project_id,
                 p.tenant_id,
                 p.status,
                 p.created_by_account_id,
                 o.id AS owner_org_id,
                 o.path AS owner_path,
                 o.type AS owner_type,
                 o.status AS owner_status
          FROM project p
          JOIN organization o ON o.id = p.owner_org_id AND o.tenant_id = p.tenant_id`;
}

function evidenceDetailsSelect(): string {
  return `SELECT e.*,
                 ma.id AS media_id,
                 ma.tenant_id AS media_tenant_id,
                 ma.project_id AS media_project_id,
                 ma.temporary_object_key,
                 ma.object_key,
                 ma.mime,
                 ma.byte_size,
                 ma.sha256,
                 ma.etag,
                 ma.classification,
                 ma.upload_status,
                 ma.scan_status,
                 ma.uploaded_by_account_id,
                 ma.upload_expires_at,
                 ma.verified_at,
                 ma.rejected_at,
                 ma.rejection_code,
                 ma.width,
                 ma.height,
                 ma.created_at AS media_created_at,
                 ma.updated_at AS media_updated_at,
                 p.status AS project_status,
                 p.created_by_account_id AS project_created_by_account_id,
                 o.id AS owner_org_id,
                 o.path AS owner_path,
                 o.type AS owner_type,
                 o.status AS owner_status
          FROM evidence e
          JOIN media_asset ma
            ON ma.id = e.media_asset_id
           AND ma.tenant_id = e.tenant_id
           AND ma.project_id = e.project_id
          JOIN project p
            ON p.id = e.project_id
           AND p.tenant_id = e.tenant_id
          JOIN organization o
            ON o.id = p.owner_org_id
           AND o.tenant_id = p.tenant_id`;
}

function mapProjectResource(row: ProjectResourceRow): EvidenceProjectResource {
  return {
    projectId: row.project_id,
    tenantId: row.tenant_id,
    status: row.status,
    createdByAccountId: row.created_by_account_id,
    ownerOrganizationId: row.owner_org_id,
    ownerOrganizationPath: row.owner_path,
    ownerOrganizationType: row.owner_type,
    ownerOrganizationStatus: row.owner_status
  };
}

function mapMediaAsset(row: MediaAssetRow): MediaAssetRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    temporaryObjectKey: row.temporary_object_key,
    objectKey: row.object_key,
    mime: row.mime,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    etag: row.etag,
    classification: row.classification,
    uploadStatus: row.upload_status,
    scanStatus: row.scan_status,
    uploadedByAccountId: row.uploaded_by_account_id,
    uploadExpiresAt: row.upload_expires_at,
    verifiedAt: row.verified_at,
    rejectedAt: row.rejected_at,
    rejectionCode: row.rejection_code,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEvidence(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    mediaAssetId: row.media_asset_id,
    type: row.type,
    title: row.title,
    description: row.description,
    occurredAt: row.occurred_at,
    visibility: row.visibility,
    validationStatus: row.validation_status,
    createdByAccountId: row.created_by_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEvidenceDetails(row: EvidenceDetailsRow): EvidenceDetails {
  return {
    evidence: mapEvidence(row),
    media: mapMediaAsset({
      id: row.media_id,
      tenant_id: row.media_tenant_id,
      project_id: row.media_project_id,
      temporary_object_key: row.temporary_object_key,
      object_key: row.object_key,
      mime: row.mime,
      byte_size: row.byte_size,
      sha256: row.sha256,
      etag: row.etag,
      classification: row.classification,
      upload_status: row.upload_status,
      scan_status: row.scan_status,
      uploaded_by_account_id: row.uploaded_by_account_id,
      upload_expires_at: row.upload_expires_at,
      verified_at: row.verified_at,
      rejected_at: row.rejected_at,
      rejection_code: row.rejection_code,
      width: row.width,
      height: row.height,
      created_at: row.media_created_at,
      updated_at: row.media_updated_at
    }),
    project: {
      projectId: row.project_id,
      tenantId: row.tenant_id,
      status: row.project_status,
      createdByAccountId: row.project_created_by_account_id,
      ownerOrganizationId: row.owner_org_id,
      ownerOrganizationPath: row.owner_path,
      ownerOrganizationType: row.owner_type,
      ownerOrganizationStatus: row.owner_status
    }
  };
}

function requireRow<TRow>(row: TRow | undefined, message: string): TRow {
  if (row === undefined) {
    throw new Error(message);
  }
  return row;
}

async function catchEvidenceConflict<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation();
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new ConflictError("Evidence already exists for this media asset.");
    }
    throw error;
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505";
}
