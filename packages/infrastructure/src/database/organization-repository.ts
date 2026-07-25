import {
  and,
  asc,
  eq,
  inArray,
  like,
  ne,
  sql
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
// pg resolves this package through the workerd condition for Cloudflare sockets.
import "pg-cloudflare";
import pg from "pg";
import {
  auditEvent,
  organization
} from "@scouthub/database";
import type { Organization } from "@scouthub/domain";
import {
  ConflictError,
  type AuditEventInput,
  type MoveSubtreeInput,
  type OrganizationDetailsUpdate,
  type OrganizationInsert,
  type OrganizationRepository,
  type OrganizationTransaction
} from "@scouthub/application";

type PgExecutor = Pick<ReturnType<typeof drizzle>, "insert" | "select" | "update">;
type OrganizationRow = typeof organization.$inferSelect;

export function createPgOrganizationRepository(
  databaseUrl: string
): OrganizationRepository {
  return new PgOrganizationRepository(databaseUrl);
}

class PgOrganizationRepository implements OrganizationRepository {
  constructor(private readonly databaseUrl: string) {}

  async transaction<TResult>(
    handler: (transaction: OrganizationTransaction) => Promise<TResult>
  ): Promise<TResult> {
    const pool = new pg.Pool({ connectionString: this.databaseUrl, max: 1 });
    const db = drizzle(pool);

    try {
      return await db.transaction((tx) => handler(new PgOrganizationTransaction(tx)));
    } finally {
      await pool.end();
    }
  }
}

class PgOrganizationTransaction implements OrganizationTransaction {
  constructor(private readonly db: PgExecutor) {}

  async findById(tenantId: string, organizationId: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organization)
      .where(and(eq(organization.tenantId, tenantId), eq(organization.id, organizationId)))
      .limit(1);

    return rows[0] === undefined ? null : mapOrganization(rows[0]);
  }

  async findByCode(tenantId: string, code: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organization)
      .where(and(eq(organization.tenantId, tenantId), eq(organization.code, code)))
      .limit(1);

    return rows[0] === undefined ? null : mapOrganization(rows[0]);
  }

  async findByIdForUpdate(
    tenantId: string,
    organizationId: string
  ): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organization)
      .where(and(eq(organization.tenantId, tenantId), eq(organization.id, organizationId)))
      .for("update")
      .limit(1);

    return rows[0] === undefined ? null : mapOrganization(rows[0]);
  }

  async listChildren(tenantId: string, parentId: string): Promise<Organization[]> {
    const rows = await this.db
      .select()
      .from(organization)
      .where(and(eq(organization.tenantId, tenantId), eq(organization.parentId, parentId)))
      .orderBy(asc(organization.type), asc(organization.name), asc(organization.id));

    return rows.map(mapOrganization);
  }

  async listAncestors(tenantId: string, organizationId: string): Promise<Organization[]> {
    const current = await this.findById(tenantId, organizationId);
    if (current === null) {
      return [];
    }

    const ancestorIds = current.path
      .split("/")
      .filter((segment) => segment.length > 0 && segment !== current.id);
    if (ancestorIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(organization)
      .where(
        and(
          eq(organization.tenantId, tenantId),
          inArray(organization.id, ancestorIds)
        )
      )
      .orderBy(asc(organization.depth));

    return rows.map(mapOrganization);
  }

  async listDescendants(tenantId: string, organizationId: string): Promise<Organization[]> {
    const current = await this.findById(tenantId, organizationId);
    if (current === null) {
      return [];
    }

    // Paths always end with "/" so a prefix scan matches complete UUID segments only.
    const rows = await this.db
      .select()
      .from(organization)
      .where(
        and(
          eq(organization.tenantId, tenantId),
          like(organization.path, `${current.path}%`),
          ne(organization.id, organizationId)
        )
      )
      .orderBy(asc(organization.path));

    return rows.map(mapOrganization);
  }

  async insertOrganization(input: OrganizationInsert): Promise<Organization> {
    const rows = await catchUniqueCodeConflict(() =>
      this.db
        .insert(organization)
        .values({
          id: input.id,
          tenantId: input.tenantId,
          parentId: input.parentId,
          type: input.type,
          name: input.name,
          code: input.code,
          status: input.status,
          path: input.path,
          depth: input.depth,
          locationLabel: input.locationLabel,
          activeFrom: input.activeFrom,
          activeUntil: input.activeUntil,
          metadata: input.metadata
        })
        .returning()
    );

    return mapRequired(rows[0]);
  }

  async updateOrganization(
    tenantId: string,
    organizationId: string,
    expectedVersion: number,
    input: OrganizationDetailsUpdate
  ): Promise<Organization | null> {
    const rows = await catchUniqueCodeConflict(() =>
      this.db
        .update(organization)
        .set({
          name: input.name,
          code: input.code,
          locationLabel: input.locationLabel,
          activeFrom: input.activeFrom,
          activeUntil: input.activeUntil,
          version: sql`${organization.version} + 1`,
          updatedAt: sql`now()`
        })
        .where(
          and(
            eq(organization.tenantId, tenantId),
            eq(organization.id, organizationId),
            eq(organization.version, expectedVersion)
          )
        )
        .returning()
    );

    return rows[0] === undefined ? null : mapOrganization(rows[0]);
  }

  async activateOrganization(
    tenantId: string,
    organizationId: string,
    expectedVersion: number
  ): Promise<Organization | null> {
    const rows = await this.db
      .update(organization)
      .set({
        status: "ACTIVE",
        version: sql`${organization.version} + 1`,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(organization.tenantId, tenantId),
          eq(organization.id, organizationId),
          eq(organization.version, expectedVersion)
        )
      )
      .returning();

    return rows[0] === undefined ? null : mapOrganization(rows[0]);
  }

  async moveSubtree(
    tenantId: string,
    input: MoveSubtreeInput
  ): Promise<Organization | null> {
    const lockedSubtree = await this.db
      .select()
      .from(organization)
      .where(
        and(
          eq(organization.tenantId, tenantId),
          like(organization.path, `${input.oldPath}%`)
        )
      )
      .for("update")
      .orderBy(asc(organization.depth));

    const current = lockedSubtree.find((row) => row.id === input.organizationId);
    if (current === undefined || current.version !== input.expectedVersion) {
      return null;
    }

    // The subtree is locked and rewritten in one statement so parent_id, path,
    // depth and version stay atomic with the audit event in the surrounding transaction.
    await this.db
      .update(organization)
      .set({
        parentId: sql`CASE WHEN ${organization.id} = ${input.organizationId}::uuid THEN ${input.newParentId}::uuid ELSE ${organization.parentId} END`,
        path: sql`${input.newPath} || substring(${organization.path} from ${input.oldPath.length + 1}::int)`,
        depth: sql`${organization.depth} + ${input.depthDelta}`,
        version: sql`${organization.version} + 1`,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(organization.tenantId, tenantId),
          like(organization.path, `${input.oldPath}%`)
        )
      );

    return this.findById(tenantId, input.organizationId);
  }

  async appendAuditEvent(input: AuditEventInput): Promise<void> {
    await this.db.insert(auditEvent).values({
      id: input.id,
      tenantId: input.tenantId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      actorKind: input.actorKind,
      actorId: input.actorId,
      requestId: input.requestId,
      metadata: input.metadata,
      occurredAt: input.occurredAt
    });
  }
}

function mapRequired(row: OrganizationRow | undefined): Organization {
  if (row === undefined) {
    throw new Error("Expected organization row.");
  }
  return mapOrganization(row);
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    tenantId: row.tenantId,
    parentId: row.parentId,
    type: row.type,
    name: row.name,
    code: row.code,
    status: row.status,
    path: row.path,
    depth: row.depth,
    locationLabel: row.locationLabel,
    activeFrom: row.activeFrom,
    activeUntil: row.activeUntil,
    metadata: {},
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function catchUniqueCodeConflict<TResult>(
  operation: () => Promise<TResult>
): Promise<TResult> {
  try {
    return await operation();
  } catch (error) {
    if (hasConstraint(error, "organization_tenant_code_unique")) {
      throw new ConflictError("Organization code already exists in this tenant.");
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
