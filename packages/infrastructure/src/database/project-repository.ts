// pg resolves this package through the workerd condition for Cloudflare sockets.
import "pg-cloudflare";
import pg from "pg";
import type { QueryResultRow } from "pg";
import type {
  Person,
  Project,
  ProjectMode,
  ProjectStatus,
  ProjectVisibility
} from "@scouthub/domain";
import type {
  ApprovalDecisionRecord,
  ApprovalRequestRecord,
  AuditEventInput,
  ProjectCommentRecord,
  ProjectDetails,
  ProjectInsert,
  ProjectListPage,
  ProjectOwnerOption,
  ProjectOwnerResource,
  ProjectPatch,
  ProjectRepository,
  ProjectReviewHistory,
  ProjectTransaction,
  ReviewQueuePage,
  StateTransitionRecord
} from "@scouthub/application";
import { ConflictError } from "@scouthub/application";

interface Queryable {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ readonly rows: TRow[]; readonly rowCount?: number | null }>;
}

type ProjectRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  owner_org_id: string;
  code: string;
  internal_slug: string;
  title: string;
  summary: string | null;
  problem_statement: string | null;
  diagnostic: string | null;
  project_mode: ProjectMode;
  status: Project["status"];
  visibility: ProjectVisibility;
  location_label: string | null;
  planned_start_at: Date | null;
  planned_end_at: Date | null;
  actual_start_at: Date | null;
  actual_end_at: Date | null;
  project_lead_person_id: string;
  created_by_account_id: string;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type ProjectDetailsRow = ProjectRow & {
  owner_name: string;
  owner_type: ProjectOwnerResource["type"];
  owner_status: ProjectOwnerResource["status"];
  owner_path: string;
  lead_display_name: string;
  lead_status: "ACTIVE" | "INACTIVE" | "ANONYMIZED";
};

type OwnerRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  name: string;
  type: ProjectOwnerResource["type"];
  status: ProjectOwnerResource["status"];
  path: string;
};

type PersonRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  birth_date: Date | null;
  classification: Person["classification"];
  status: Person["status"];
  created_at: Date;
  updated_at: Date;
};

type ApprovalRequestRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  resource_id: string;
  status: ApprovalRequestRecord["status"];
  submitted_project_version: number;
  requested_by_account_id: string;
  requested_at: Date;
  resolved_at: Date | null;
};

type ApprovalDecisionRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  request_id: string;
  reviewer_account_id: string;
  decision: ApprovalDecisionRecord["decision"];
  reason: string | null;
  decided_at: Date;
};

type StateTransitionRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  entity_id: string;
  from_state: ProjectStatus;
  to_state: ProjectStatus;
  actor_account_id: string;
  approval_request_id: string | null;
  reason: string | null;
  occurred_at: Date;
};

type ProjectCommentRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  project_id: string;
  approval_request_id: string;
  author_account_id: string;
  kind: ProjectCommentRecord["kind"];
  field_key: string | null;
  body: string;
  created_at: Date;
};

type ReviewQueueRow = QueryResultRow & {
  approval_request_id: string;
  project_id: string;
  code: string;
  title: string;
  owner_org_id: string;
  owner_name: string;
  owner_type: "GROUP" | "UNIT";
  project_status: ProjectStatus;
  project_version: number;
  requested_at: Date;
  requested_by_account_id: string;
  submitted_project_version: number;
  is_resubmission: boolean;
};

export function createPgProjectRepository(databaseUrl: string): ProjectRepository {
  return new PgProjectRepository(databaseUrl);
}

class PgProjectRepository implements ProjectRepository {
  constructor(private readonly databaseUrl: string) {}

  async transaction<TResult>(
    handler: (transaction: ProjectTransaction) => Promise<TResult>
  ): Promise<TResult> {
    const pool = new pg.Pool({ connectionString: this.databaseUrl, max: 1 });
    try {
      await pool.query("BEGIN");
      const result = await handler(new PgProjectTransaction(pool));
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

class PgProjectTransaction implements ProjectTransaction {
  constructor(private readonly db: Queryable) {}

  async findOwnerOrganization(
    tenantId: string,
    organizationId: string
  ): Promise<ProjectOwnerResource | null> {
    const result = await this.db.query<OwnerRow>(
      `SELECT id, tenant_id, name, type, status, path
       FROM organization
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, organizationId]
    );
    return result.rows[0] === undefined ? null : mapOwner(result.rows[0]);
  }

  async findPersonForAccountInTenant(
    tenantId: string,
    accountId: string
  ): Promise<Person | null> {
    const result = await this.db.query<PersonRow>(
      `SELECT p.*
       FROM person p
       JOIN account_person_link apl
         ON apl.person_id = p.id
        AND apl.tenant_id = p.tenant_id
       WHERE apl.tenant_id = $1
         AND apl.account_id = $2
       LIMIT 1`,
      [tenantId, accountId]
    );
    return result.rows[0] === undefined ? null : mapPerson(result.rows[0]);
  }

  async findProjectById(tenantId: string, projectId: string): Promise<ProjectDetails | null> {
    const result = await this.db.query<ProjectDetailsRow>(
      `${projectDetailsSelect()}
       WHERE p.tenant_id = $1 AND p.id = $2
       LIMIT 1`,
      [tenantId, projectId]
    );
    return result.rows[0] === undefined ? null : mapProjectDetails(result.rows[0]);
  }

  async findProjectByIdForUpdate(tenantId: string, projectId: string): Promise<ProjectDetails | null> {
    const result = await this.db.query<ProjectDetailsRow>(
      `${projectDetailsSelect()}
       WHERE p.tenant_id = $1 AND p.id = $2
       FOR UPDATE OF p`,
      [tenantId, projectId]
    );
    return result.rows[0] === undefined ? null : mapProjectDetails(result.rows[0]);
  }

  async findApprovalRequestByIdForUpdate(
    tenantId: string,
    approvalRequestId: string
  ): Promise<ApprovalRequestRecord | null> {
    const result = await this.db.query<ApprovalRequestRow>(
      `SELECT id, tenant_id, resource_id, status, submitted_project_version,
              requested_by_account_id, requested_at, resolved_at
       FROM approval_request
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, approvalRequestId]
    );
    return result.rows[0] === undefined ? null : mapApprovalRequest(result.rows[0]);
  }

  async listProjectsForScopes(input: {
    readonly tenantId: string;
    readonly scopePaths: readonly string[];
    readonly limit: number;
    readonly cursor: { readonly updatedAt: Date; readonly id: string } | null;
    readonly filters: {
      readonly ownerOrganizationId?: string;
      readonly projectMode?: ProjectMode;
      readonly status?: "DRAFT";
    };
  }): Promise<ProjectListPage> {
    const values: unknown[] = [input.tenantId, input.scopePaths, input.limit + 1];
    const predicates = [
      "p.tenant_id = $1",
      // Owner paths terminate with "/" UUID segments, so prefix matching covers
      // descendants without confusing sibling IDs. The DB filters before any DTO
      // is returned to the application.
      "EXISTS (SELECT 1 FROM unnest($2::text[]) AS scope_path WHERE o.path LIKE scope_path || '%')"
    ];
    if (input.cursor !== null) {
      values.push(input.cursor.updatedAt, input.cursor.id);
      predicates.push(`(p.updated_at, p.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    if (input.filters.ownerOrganizationId !== undefined) {
      values.push(input.filters.ownerOrganizationId);
      predicates.push(`p.owner_org_id = $${values.length}::uuid`);
    }
    if (input.filters.projectMode !== undefined) {
      values.push(input.filters.projectMode);
      predicates.push(`p.project_mode = $${values.length}::project_mode`);
    }
    if (input.filters.status !== undefined) {
      values.push(input.filters.status);
      predicates.push(`p.status = $${values.length}::project_status`);
    }

    const result = await this.db.query<ProjectDetailsRow>(
      `${projectDetailsSelect()}
       WHERE ${predicates.join(" AND ")}
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT $3`,
      values
    );
    const rows = result.rows.slice(0, input.limit);
    const last = rows.at(-1);
    return {
      projects: rows.map(mapProjectDetails),
      nextCursor: result.rows.length > input.limit && last !== undefined
        ? { updatedAt: last.updated_at, id: last.id }
        : null
    };
  }

  async listProjectOwnerOptionsForScopes(
    tenantId: string,
    scopePaths: readonly string[]
  ): Promise<ProjectOwnerOption[]> {
    const result = await this.db.query<QueryResultRow & ProjectOwnerOption>(
      `SELECT o.id, o.name, o.type, o.path
       FROM organization o
       WHERE o.tenant_id = $1
         AND o.status = 'ACTIVE'
         AND o.type IN ('GROUP', 'UNIT')
         AND EXISTS (
           SELECT 1 FROM unnest($2::text[]) AS scope_path
           WHERE o.path LIKE scope_path || '%'
         )
       ORDER BY o.path, o.name`,
      [tenantId, scopePaths]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      path: row.path
    }));
  }

  async insertProject(input: ProjectInsert): Promise<ProjectDetails> {
    await catchProjectUniqueConflict(() =>
      this.db.query(
        `INSERT INTO project (
          id, tenant_id, owner_org_id, code, internal_slug, title, summary,
          problem_statement, diagnostic, project_mode, status, visibility,
          location_label, planned_start_at, planned_end_at, actual_start_at,
          actual_end_at, project_lead_person_id, created_by_account_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19
        )`,
        [
          input.id,
          input.tenantId,
          input.ownerOrganizationId,
          input.code,
          input.internalSlug,
          input.title,
          input.summary,
          input.problemStatement,
          input.diagnostic,
          input.projectMode,
          input.status,
          input.visibility,
          input.locationLabel,
          input.plannedStartAt,
          input.plannedEndAt,
          input.actualStartAt,
          input.actualEndAt,
          input.projectLeadPersonId,
          input.createdByAccountId
        ]
      )
    );
    const created = await this.findProjectById(input.tenantId, input.id);
    if (created === null) {
      throw new Error("Expected created project.");
    }
    return created;
  }

  async updateProject(
    tenantId: string,
    projectId: string,
    expectedVersion: number,
    patch: ProjectPatch
  ): Promise<ProjectDetails | null> {
    const sets: string[] = [];
    const values: unknown[] = [tenantId, projectId, expectedVersion];
    addSet(sets, values, "title", patch.title);
    addSet(sets, values, "summary", patch.summary);
    addSet(sets, values, "problem_statement", patch.problemStatement);
    addSet(sets, values, "diagnostic", patch.diagnostic);
    addSet(sets, values, "project_mode", patch.projectMode, "project_mode");
    addSet(sets, values, "visibility", patch.visibility, "project_visibility");
    addSet(sets, values, "location_label", patch.locationLabel);
    addSet(sets, values, "planned_start_at", patch.plannedStartAt);
    addSet(sets, values, "planned_end_at", patch.plannedEndAt);
    addSet(sets, values, "actual_start_at", patch.actualStartAt);
    addSet(sets, values, "actual_end_at", patch.actualEndAt);
    sets.push("version = version + 1", "updated_at = now()");

    const result = await this.db.query(
      `UPDATE project
       SET ${sets.join(", ")}
       WHERE tenant_id = $1 AND id = $2 AND version = $3`,
      values
    );
    if (result.rowCount !== 1) {
      return null;
    }
    return this.findProjectById(tenantId, projectId);
  }

  async updateProjectStatus(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
    readonly fromStatus: ProjectStatus;
    readonly toStatus: ProjectStatus;
  }): Promise<ProjectDetails | null> {
    const result = await this.db.query(
      `UPDATE project
       SET status = $5::project_status,
           version = version + 1,
           updated_at = now()
       WHERE tenant_id = $1
         AND id = $2
         AND version = $3
         AND status = $4::project_status`,
      [input.tenantId, input.projectId, input.expectedVersion, input.fromStatus, input.toStatus]
    );
    if (result.rowCount !== 1) {
      return null;
    }
    return this.findProjectById(input.tenantId, input.projectId);
  }

  async createApprovalRequest(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly projectId: string;
    readonly submittedProjectVersion: number;
    readonly requestedByAccountId: string;
    readonly requestedAt: Date;
  }): Promise<ApprovalRequestRecord> {
    const result = await catchWorkflowConflict(() =>
      this.db.query<ApprovalRequestRow>(
        `INSERT INTO approval_request (
          id, tenant_id, resource_id, submitted_project_version,
          requested_by_account_id, requested_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, tenant_id, resource_id, status, submitted_project_version,
                  requested_by_account_id, requested_at, resolved_at`,
        [
          input.id,
          input.tenantId,
          input.projectId,
          input.submittedProjectVersion,
          input.requestedByAccountId,
          input.requestedAt
        ]
      )
    );
    return mapApprovalRequest(requireReturnedRow(result.rows[0], "Expected created approval request."));
  }

  async resolveApprovalRequest(input: {
    readonly tenantId: string;
    readonly approvalRequestId: string;
    readonly status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
    readonly resolvedAt: Date;
  }): Promise<ApprovalRequestRecord | null> {
    const result = await this.db.query<ApprovalRequestRow>(
      `UPDATE approval_request
       SET status = $3::approval_request_status,
           resolved_at = $4,
           updated_at = now()
       WHERE tenant_id = $1
         AND id = $2
         AND status = 'PENDING'
       RETURNING id, tenant_id, resource_id, status, submitted_project_version,
                 requested_by_account_id, requested_at, resolved_at`,
      [input.tenantId, input.approvalRequestId, input.status, input.resolvedAt]
    );
    return result.rows[0] === undefined ? null : mapApprovalRequest(result.rows[0]);
  }

  async appendApprovalDecision(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly approvalRequestId: string;
    readonly reviewerAccountId: string;
    readonly decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
    readonly reason: string | null;
    readonly decidedAt: Date;
  }): Promise<ApprovalDecisionRecord> {
    const result = await catchWorkflowConflict(() =>
      this.db.query<ApprovalDecisionRow>(
        `INSERT INTO approval_decision (
          id, tenant_id, request_id, reviewer_account_id, decision, reason, decided_at
        )
        VALUES ($1, $2, $3, $4, $5::approval_decision_type, $6, $7)
        RETURNING id, tenant_id, request_id, reviewer_account_id, decision, reason, decided_at`,
        [
          input.id,
          input.tenantId,
          input.approvalRequestId,
          input.reviewerAccountId,
          input.decision,
          input.reason,
          input.decidedAt
        ]
      )
    );
    return mapApprovalDecision(requireReturnedRow(result.rows[0], "Expected created approval decision."));
  }

  async appendStateTransition(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly projectId: string;
    readonly fromState: ProjectStatus;
    readonly toState: ProjectStatus;
    readonly actorAccountId: string;
    readonly approvalRequestId: string | null;
    readonly reason: string | null;
    readonly occurredAt: Date;
  }): Promise<StateTransitionRecord> {
    const result = await this.db.query<StateTransitionRow>(
      `INSERT INTO state_transition (
        id, tenant_id, entity_id, from_state, to_state,
        actor_account_id, approval_request_id, reason, occurred_at
      )
      VALUES ($1, $2, $3, $4::project_status, $5::project_status, $6, $7, $8, $9)
      RETURNING id, tenant_id, entity_id, from_state, to_state,
                actor_account_id, approval_request_id, reason, occurred_at`,
      [
        input.id,
        input.tenantId,
        input.projectId,
        input.fromState,
        input.toState,
        input.actorAccountId,
        input.approvalRequestId,
        input.reason,
        input.occurredAt
      ]
    );
    return mapStateTransition(requireReturnedRow(result.rows[0], "Expected created state transition."));
  }

  async appendProjectComment(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly projectId: string;
    readonly approvalRequestId: string;
    readonly authorAccountId: string;
    readonly kind: "GLOBAL" | "FIELD";
    readonly fieldKey: string | null;
    readonly body: string;
    readonly createdAt: Date;
  }): Promise<ProjectCommentRecord> {
    const result = await this.db.query<ProjectCommentRow>(
      `INSERT INTO project_comment (
        id, tenant_id, project_id, approval_request_id,
        author_account_id, kind, field_key, body, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::project_comment_kind, $7, $8, $9)
      RETURNING id, tenant_id, project_id, approval_request_id,
                author_account_id, kind, field_key, body, created_at`,
      [
        input.id,
        input.tenantId,
        input.projectId,
        input.approvalRequestId,
        input.authorAccountId,
        input.kind,
        input.fieldKey,
        input.body,
        input.createdAt
      ]
    );
    return mapProjectComment(requireReturnedRow(result.rows[0], "Expected created project comment."));
  }

  async listReviewQueueForScopes(input: {
    readonly tenantId: string;
    readonly scopePaths: readonly string[];
    readonly limit: number;
    readonly cursor: { readonly requestedAt: Date; readonly id: string } | null;
    readonly status?: ApprovalRequestRecord["status"];
  }): Promise<ReviewQueuePage> {
    const values: unknown[] = [input.tenantId, input.scopePaths, input.limit + 1];
    const predicates = [
      "ar.tenant_id = $1",
      "EXISTS (SELECT 1 FROM unnest($2::text[]) AS scope_path WHERE o.path LIKE scope_path || '%')"
    ];
    if (input.cursor !== null) {
      values.push(input.cursor.requestedAt, input.cursor.id);
      predicates.push(`(ar.requested_at, ar.id) > ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    if (input.status !== undefined) {
      values.push(input.status);
      predicates.push(`ar.status = $${values.length}::approval_request_status`);
    }

    const result = await this.db.query<ReviewQueueRow>(
      `SELECT
         ar.id AS approval_request_id,
         p.id AS project_id,
         p.code,
         p.title,
         o.id AS owner_org_id,
         o.name AS owner_name,
         o.type AS owner_type,
         p.status AS project_status,
         p.version AS project_version,
         ar.requested_at,
         ar.requested_by_account_id,
         ar.submitted_project_version,
         EXISTS (
           SELECT 1
           FROM approval_request previous
           WHERE previous.tenant_id = ar.tenant_id
             AND previous.resource_id = ar.resource_id
             AND previous.requested_at < ar.requested_at
         ) AS is_resubmission
       FROM approval_request ar
       JOIN project p ON p.id = ar.resource_id AND p.tenant_id = ar.tenant_id
       JOIN organization o ON o.id = p.owner_org_id AND o.tenant_id = p.tenant_id
       WHERE ${predicates.join(" AND ")}
       ORDER BY ar.requested_at ASC, ar.id ASC
       LIMIT $3`,
      values
    );
    const rows = result.rows.slice(0, input.limit);
    const last = rows.at(-1);
    return {
      items: rows.map(mapReviewQueueItem),
      nextCursor: result.rows.length > input.limit && last !== undefined
        ? { requestedAt: last.requested_at, id: last.approval_request_id }
        : null
    };
  }

  async listProjectReviewHistory(tenantId: string, projectId: string): Promise<ProjectReviewHistory> {
    const requests = await this.db.query<ApprovalRequestRow>(
      `SELECT id, tenant_id, resource_id, status, submitted_project_version,
              requested_by_account_id, requested_at, resolved_at
       FROM approval_request
       WHERE tenant_id = $1 AND resource_id = $2
       ORDER BY requested_at ASC, id ASC`,
      [tenantId, projectId]
    );
    const decisions = await this.db.query<ApprovalDecisionRow>(
      `SELECT d.id, d.tenant_id, d.request_id, d.reviewer_account_id,
              d.decision, d.reason, d.decided_at
       FROM approval_decision d
       JOIN approval_request ar ON ar.id = d.request_id AND ar.tenant_id = d.tenant_id
       WHERE ar.tenant_id = $1 AND ar.resource_id = $2
       ORDER BY d.decided_at ASC, d.id ASC`,
      [tenantId, projectId]
    );
    const comments = await this.db.query<ProjectCommentRow>(
      `SELECT id, tenant_id, project_id, approval_request_id,
              author_account_id, kind, field_key, body, created_at
       FROM project_comment
       WHERE tenant_id = $1 AND project_id = $2
       ORDER BY created_at ASC, id ASC`,
      [tenantId, projectId]
    );
    const transitions = await this.db.query<StateTransitionRow>(
      `SELECT id, tenant_id, entity_id, from_state, to_state,
              actor_account_id, approval_request_id, reason, occurred_at
       FROM state_transition
       WHERE tenant_id = $1 AND entity_id = $2
       ORDER BY occurred_at ASC, id ASC`,
      [tenantId, projectId]
    );
    return {
      requests: requests.rows.map(mapApprovalRequest),
      decisions: decisions.rows.map(mapApprovalDecision),
      comments: comments.rows.map(mapProjectComment),
      transitions: transitions.rows.map(mapStateTransition)
    };
  }

  async appendAuditEvent(input: AuditEventInput): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_event (
        id, tenant_id, resource_type, resource_id, action,
        actor_kind, actor_id, request_id, metadata, occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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

function projectDetailsSelect(): string {
  return `SELECT
    p.*,
    o.name AS owner_name,
    o.type AS owner_type,
    o.status AS owner_status,
    o.path AS owner_path,
    lead.display_name AS lead_display_name,
    lead.status AS lead_status
   FROM project p
   JOIN organization o ON o.id = p.owner_org_id AND o.tenant_id = p.tenant_id
   JOIN person lead ON lead.id = p.project_lead_person_id AND lead.tenant_id = p.tenant_id`;
}

function addSet(
  sets: string[],
  values: unknown[],
  column: string,
  value: unknown,
  enumType?: string
): void {
  if (value === undefined) {
    return;
  }
  values.push(value);
  const cast = enumType === undefined ? "" : `::${enumType}`;
  sets.push(`${column} = $${values.length}${cast}`);
}

function mapProjectDetails(row: ProjectDetailsRow): ProjectDetails {
  return {
    project: mapProject(row),
    owner: {
      tenantId: row.tenant_id,
      organizationId: row.owner_org_id,
      name: row.owner_name,
      type: row.owner_type,
      status: row.owner_status,
      path: row.owner_path
    },
    projectLead: {
      id: row.project_lead_person_id,
      displayName: row.lead_display_name,
      status: row.lead_status
    }
  };
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ownerOrganizationId: row.owner_org_id,
    code: row.code,
    internalSlug: row.internal_slug,
    title: row.title,
    summary: row.summary,
    problemStatement: row.problem_statement,
    diagnostic: row.diagnostic,
    projectMode: row.project_mode,
    status: row.status,
    visibility: row.visibility,
    locationLabel: row.location_label,
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    actualStartAt: row.actual_start_at,
    actualEndAt: row.actual_end_at,
    projectLeadPersonId: row.project_lead_person_id,
    createdByAccountId: row.created_by_account_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOwner(row: OwnerRow): ProjectOwnerResource {
  return {
    tenantId: row.tenant_id,
    organizationId: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    path: row.path
  };
}

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    birthDate: row.birth_date,
    classification: row.classification,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function catchProjectUniqueConflict<TResult>(
  operation: () => Promise<TResult>
): Promise<TResult> {
  try {
    return await operation();
  } catch (error) {
    if (
      hasConstraint(error, "project_tenant_code_unique") ||
      hasConstraint(error, "project_tenant_internal_slug_unique")
    ) {
      throw new ConflictError("Project generated identifier already exists.");
    }
    throw error;
  }
}

async function catchWorkflowConflict<TResult>(
  operation: () => Promise<TResult>
): Promise<TResult> {
  try {
    return await operation();
  } catch (error) {
    if (
      hasConstraint(error, "approval_request_one_pending_project_stage_unique") ||
      hasConstraint(error, "approval_decision_request_unique")
    ) {
      throw new ConflictError("Project review state changed concurrently.");
    }
    throw error;
  }
}

function mapApprovalRequest(row: ApprovalRequestRow): ApprovalRequestRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.resource_id,
    status: row.status,
    submittedProjectVersion: row.submitted_project_version,
    requestedByAccountId: row.requested_by_account_id,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at
  };
}

function mapApprovalDecision(row: ApprovalDecisionRow): ApprovalDecisionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    approvalRequestId: row.request_id,
    reviewerAccountId: row.reviewer_account_id,
    decision: row.decision,
    reason: row.reason,
    decidedAt: row.decided_at
  };
}

function mapStateTransition(row: StateTransitionRow): StateTransitionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    fromState: row.from_state,
    toState: row.to_state,
    actorAccountId: row.actor_account_id,
    approvalRequestId: row.approval_request_id,
    reason: row.reason,
    occurredAt: row.occurred_at
  };
}

function mapProjectComment(row: ProjectCommentRow): ProjectCommentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    approvalRequestId: row.approval_request_id,
    authorAccountId: row.author_account_id,
    kind: row.kind,
    fieldKey: row.field_key,
    body: row.body,
    createdAt: row.created_at
  };
}

function mapReviewQueueItem(row: ReviewQueueRow): ReviewQueuePage["items"][number] {
  return {
    approvalRequestId: row.approval_request_id,
    projectId: row.project_id,
    code: row.code,
    title: row.title,
    ownerOrganization: {
      id: row.owner_org_id,
      name: row.owner_name,
      type: row.owner_type
    },
    projectStatus: row.project_status,
    projectVersion: row.project_version,
    requestedAt: row.requested_at,
    requestedByAccountId: row.requested_by_account_id,
    submittedProjectVersion: row.submitted_project_version,
    isResubmission: row.is_resubmission
  };
}

function hasConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("constraint" in error && error.constraint === constraint) {
    return true;
  }
  return "cause" in error && hasConstraint(error.cause, constraint);
}

function requireReturnedRow<TRow>(row: TRow | undefined, message: string): TRow {
  if (row === undefined) {
    throw new Error(message);
  }
  return row;
}
