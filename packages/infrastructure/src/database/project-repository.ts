// pg resolves this package through the workerd condition for Cloudflare sockets.
import "pg-cloudflare";
import pg from "pg";
import type { QueryResultRow } from "pg";
import type {
  Person,
  Project,
  ProjectMode,
  ProjectVisibility
} from "@scouthub/domain";
import type {
  AuditEventInput,
  ProjectDetails,
  ProjectInsert,
  ProjectListPage,
  ProjectOwnerOption,
  ProjectOwnerResource,
  ProjectPatch,
  ProjectRepository,
  ProjectTransaction
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
    lead.display_name AS lead_display_name
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
      displayName: row.lead_display_name
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

function hasConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("constraint" in error && error.constraint === constraint) {
    return true;
  }
  return "cause" in error && hasConstraint(error.cause, constraint);
}
