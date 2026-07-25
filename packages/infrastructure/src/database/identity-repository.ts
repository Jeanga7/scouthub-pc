// pg resolves this package through the workerd condition for Cloudflare sockets.
import "pg-cloudflare";
import pg from "pg";
import type { QueryResultRow } from "pg";
import type {
  Account,
  AccountInvitation,
  Person,
  PermissionCode,
  RoleAssignment,
  RoleCode,
  RoleScopeType
} from "@scouthub/domain";
import type {
  ActorContext,
  BootstrapRegionalAdminInput,
  CreateRoleAssignmentInput,
  CreatedInvitationDraft,
  IdentityRepository,
  IdentityTransaction,
  InviteAdultUserRecord
} from "@scouthub/application";
import type { AuditEventInput } from "@scouthub/application";
import { ConflictError, NotFoundError } from "@scouthub/application";

interface Queryable {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ readonly rows: TRow[]; readonly rowCount?: number | null }>;
}

type AccountRow = QueryResultRow & {
  id: string;
  external_identity_id: string | null;
  primary_email: string;
  status: Account["status"];
  last_login_at: Date | null;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
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

type InvitationRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  account_id: string;
  person_id: string;
  email: string;
  intended_role_id: string;
  intended_role_code: string;
  intended_scope_org_id: string;
  status: AccountInvitation["status"];
  external_invitation_id: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  invited_by_account_id: string;
  adult_eligibility_attested_at: Date;
  adult_eligibility_attested_by: string;
  created_at: Date;
  updated_at: Date;
};

type AssignmentRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  account_id: string;
  role_id: string;
  role_code: RoleCode;
  permissions: PermissionCode[];
  scope_type: RoleScopeType;
  scope_org_id: string | null;
  scope_path: string | null;
  starts_at: Date;
  ends_at: Date | null;
  granted_by_account_id: string | null;
  granted_at: Date;
  revoked_at: Date | null;
};

export function createPgIdentityRepository(databaseUrl: string): IdentityRepository {
  return new PgIdentityRepository(databaseUrl);
}

class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly databaseUrl: string) {}

  async transaction<TResult>(
    handler: (transaction: IdentityTransaction) => Promise<TResult>
  ): Promise<TResult> {
    const pool = new pg.Pool({ connectionString: this.databaseUrl, max: 1 });
    try {
      await pool.query("BEGIN");
      const result = await handler(new PgIdentityTransaction(pool));
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

class PgIdentityTransaction implements IdentityTransaction {
  constructor(private readonly db: Queryable) {}

  async findActorBySubject(subjectId: string): Promise<ActorContext | null> {
    const account = await this.findAccountBySubjectForUpdate(subjectId);
    if (account === null) {
      return null;
    }
    const person = await this.findPersonForAccount(account.id);
    return {
      account,
      person,
      assignments: await this.findAssignmentsForAccount(account.id),
      assuranceLevel: "standard"
    };
  }

  async findAccountById(accountId: string): Promise<Account | null> {
    const rows = await this.db.query<AccountRow>(
      "SELECT * FROM account WHERE id = $1 LIMIT 1",
      [accountId]
    );
    return rows.rows[0] === undefined ? null : mapAccount(rows.rows[0]);
  }

  async findAccountBySubjectForUpdate(subjectId: string): Promise<Account | null> {
    const rows = await this.db.query<AccountRow>(
      "SELECT * FROM account WHERE external_identity_id = $1 FOR UPDATE",
      [subjectId]
    );
    return rows.rows[0] === undefined ? null : mapAccount(rows.rows[0]);
  }

  async findInvitationForUpdate(invitationId: string): Promise<AccountInvitation | null> {
    const rows = await this.db.query<InvitationRow>(
      `SELECT ai.*, rd.code AS intended_role_code
       FROM account_invitation ai
       JOIN role_definition rd ON rd.id = ai.intended_role_id
       WHERE ai.id = $1
       FOR UPDATE`,
      [invitationId]
    );
    return rows.rows[0] === undefined ? null : mapInvitation(rows.rows[0]);
  }

  async createInvitationDraft(
    input: InviteAdultUserRecord
  ): Promise<CreatedInvitationDraft> {
    const role = await this.findRoleId(input.roleCode);
    const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
    await this.db.query(
      `INSERT INTO person (id, tenant_id, first_name, last_name, display_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.ids.personId, input.tenantId, input.firstName.trim(), input.lastName.trim(), displayName]
    );
    await this.db.query(
      `INSERT INTO account (id, primary_email, status)
       VALUES ($1, $2, 'INVITED')`,
      [input.ids.accountId, input.email]
    );
    await this.db.query(
      `INSERT INTO account_person_link (account_id, tenant_id, person_id)
       VALUES ($1, $2, $3)`,
      [input.ids.accountId, input.tenantId, input.ids.personId]
    );
    await this.db.query(
      `INSERT INTO account_invitation (
        id, tenant_id, account_id, person_id, email, intended_role_id,
        intended_scope_org_id, status, expires_at, invited_by_account_id,
        adult_eligibility_attested_at, adult_eligibility_attested_by
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'CREATING', $8, $9, $10, $9)`,
      [
        input.ids.invitationId,
        input.tenantId,
        input.ids.accountId,
        input.ids.personId,
        input.email,
        role.id,
        input.scopeOrganizationId,
        input.expiresAt,
        input.invitedByAccountId,
        input.adultEligibilityAttestedAt
      ]
    );
    const invitation = await this.findInvitationForUpdate(input.ids.invitationId);
    if (invitation === null) {
      throw new Error("Expected invitation draft.");
    }
    return { invitation, roleId: role.id };
  }

  async markInvitationPending(
    invitationId: string,
    externalInvitationId: string
  ): Promise<AccountInvitation> {
    await this.db.query(
      `UPDATE account_invitation
       SET status = 'PENDING', external_invitation_id = $2, updated_at = now()
       WHERE id = $1`,
      [invitationId, externalInvitationId]
    );
    const invitation = await this.findInvitationForUpdate(invitationId);
    if (invitation === null) {
      throw new Error("Expected invitation.");
    }
    return invitation;
  }

  async markInvitationFailed(invitationId: string): Promise<void> {
    await this.db.query(
      "UPDATE account_invitation SET status = 'FAILED', updated_at = now() WHERE id = $1",
      [invitationId]
    );
  }

  async acceptInvitation(input: {
    readonly invitationId: string;
    readonly subjectId: string;
    readonly emailVerifiedAt: Date;
    readonly roleAssignmentId: string;
  }): Promise<ActorContext> {
    const invitation = await this.findInvitationForUpdate(input.invitationId);
    if (invitation === null) {
      throw new NotFoundError("Invitation not found.");
    }
    await this.db.query(
      `UPDATE account
       SET external_identity_id = $2, status = 'ACTIVE',
           email_verified_at = $3, updated_at = now()
       WHERE id = $1`,
      [invitation.accountId, input.subjectId, input.emailVerifiedAt]
    );
    await this.db.query(
      `INSERT INTO role_assignment (
        id, tenant_id, account_id, role_id, scope_type, scope_org_id,
        starts_at, granted_by_account_id
      )
       VALUES ($1, $2, $3, $4, 'REGION', $5, now(), $6)`,
      [
        input.roleAssignmentId,
        invitation.tenantId,
        invitation.accountId,
        invitation.intendedRoleId,
        invitation.intendedScopeOrgId,
        invitation.invitedByAccountId
      ]
    );
    await this.db.query(
      `UPDATE account_invitation
       SET status = 'ACCEPTED', accepted_at = now(), updated_at = now()
       WHERE id = $1`,
      [invitation.id]
    );
    const actor = await this.findActorBySubject(input.subjectId);
    if (actor === null) {
      throw new Error("Expected provisioned actor.");
    }
    return actor;
  }

  async listInvitations(tenantId: string): Promise<AccountInvitation[]> {
    const rows = await this.db.query<InvitationRow>(
      `SELECT ai.*, rd.code AS intended_role_code
       FROM account_invitation ai
       JOIN role_definition rd ON rd.id = ai.intended_role_id
       WHERE ai.tenant_id = $1
       ORDER BY ai.created_at DESC`,
      [tenantId]
    );
    return rows.rows.map(mapInvitation);
  }

  async revokeInvitation(input: {
    readonly tenantId: string;
    readonly invitationId: string;
    readonly revokedByAccountId: string;
  }): Promise<AccountInvitation | null> {
    await this.db.query(
      `UPDATE account_invitation
       SET status = 'REVOKED', revoked_at = now(), updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status = 'PENDING'`,
      [input.tenantId, input.invitationId]
    );
    return this.findInvitationForUpdate(input.invitationId);
  }

  async listRoleAssignments(tenantId: string): Promise<RoleAssignment[]> {
    const rows = await this.db.query<AssignmentRow>(assignmentSql("ra.tenant_id = $1"), [
      tenantId
    ]);
    return rows.rows.map(mapAssignment);
  }

  async createRoleAssignment(input: CreateRoleAssignmentInput): Promise<RoleAssignment> {
    const role = await this.findRoleId(input.roleCode);
    await this.db.query(
      `INSERT INTO role_assignment (
        id, tenant_id, account_id, role_id, scope_type, scope_org_id,
        starts_at, ends_at, granted_by_account_id
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.id,
        input.tenantId,
        input.accountId,
        role.id,
        input.scopeType,
        input.scopeOrgId,
        input.startsAt,
        input.endsAt,
        input.grantedByAccountId
      ]
    );
    const rows = await this.db.query<AssignmentRow>(assignmentSql("ra.id = $1"), [input.id]);
    return mapRequiredAssignment(rows.rows[0]);
  }

  async revokeRoleAssignment(input: {
    readonly tenantId: string;
    readonly roleAssignmentId: string;
    readonly revokedByAccountId: string;
    readonly reason: string | null;
  }): Promise<RoleAssignment | null> {
    await this.db.query(
      `UPDATE role_assignment
       SET revoked_at = now(), revoked_by_account_id = $3, revocation_reason = $4
       WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL`,
      [input.tenantId, input.roleAssignmentId, input.revokedByAccountId, input.reason]
    );
    const rows = await this.db.query<AssignmentRow>(assignmentSql("ra.id = $1"), [
      input.roleAssignmentId
    ]);
    return rows.rows[0] === undefined ? null : mapAssignment(rows.rows[0]);
  }

  async suspendAccount(input: {
    readonly tenantId: string;
    readonly accountId: string;
  }): Promise<Account | null> {
    const regionalAdmins = await this.countActiveRegionalAdminsForAccount(
      input.tenantId,
      input.accountId
    );
    if (regionalAdmins > 0) {
      const allRegionalAdmins = await this.countAllActiveRegionalAdmins(input.tenantId);
      if (allRegionalAdmins <= 1) {
        throw new ConflictError("Cannot suspend the last active Regional Admin.");
      }
    }
    const rows = await this.db.query<AccountRow>(
      `UPDATE account
       SET status = 'SUSPENDED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [input.accountId]
    );
    return rows.rows[0] === undefined ? null : mapAccount(rows.rows[0]);
  }

  async countActiveRegionalAdmins(
    tenantId: string,
    regionOrganizationId: string,
    now: Date
  ): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM role_assignment ra
       JOIN role_definition rd ON rd.id = ra.role_id
       WHERE ra.tenant_id = $1
         AND rd.code = 'REGIONAL_ADMIN'
         AND ra.scope_org_id = $2
         AND ra.starts_at <= $3
         AND (ra.ends_at IS NULL OR $3 < ra.ends_at)
         AND ra.revoked_at IS NULL`,
      [tenantId, regionOrganizationId, now]
    );
    return rows.rows[0]?.count ?? 0;
  }

  async bootstrapRegionalAdmin(
    input: BootstrapRegionalAdminInput
  ): Promise<ActorContext> {
    const role = await this.findRoleId("REGIONAL_ADMIN");
    const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
    await this.db.query(
      `INSERT INTO person (id, tenant_id, first_name, last_name, display_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.ids.personId, input.tenantId, input.firstName.trim(), input.lastName.trim(), displayName]
    );
    await this.db.query(
      `INSERT INTO account (
        id, external_identity_id, primary_email, status, email_verified_at
      )
       VALUES ($1, $2, $3, 'ACTIVE', now())`,
      [input.ids.accountId, input.subjectId, input.email]
    );
    await this.db.query(
      `INSERT INTO account_person_link (account_id, tenant_id, person_id)
       VALUES ($1, $2, $3)`,
      [input.ids.accountId, input.tenantId, input.ids.personId]
    );
    await this.db.query(
      `INSERT INTO role_assignment (
        id, tenant_id, account_id, role_id, scope_type, scope_org_id,
        starts_at, granted_by_account_id
      )
       VALUES ($1, $2, $3, $4, 'REGION', $5, now(), $3)`,
      [
        input.ids.roleAssignmentId,
        input.tenantId,
        input.ids.accountId,
        role.id,
        input.regionOrganizationId
      ]
    );
    const actor = await this.findActorBySubject(input.subjectId);
    if (actor === null) {
      throw new Error("Expected bootstrapped actor.");
    }
    return actor;
  }

  async findOrganizationResource(
    tenantId: string,
    organizationId: string
  ): Promise<{ tenantId: string; organizationId: string; path: string } | null> {
    const rows = await this.db.query<{ tenant_id: string; id: string; path: string }>(
      "SELECT tenant_id, id, path FROM organization WHERE tenant_id = $1 AND id = $2 LIMIT 1",
      [tenantId, organizationId]
    );
    const row = rows.rows[0];
    return row === undefined
      ? null
      : { tenantId: row.tenant_id, organizationId: row.id, path: row.path };
  }

  async getRolePermissions(roleCode: RoleCode): Promise<readonly PermissionCode[]> {
    const rows = await this.db.query<{ code: PermissionCode }>(
      `SELECT pd.code
       FROM role_definition rd
       JOIN role_permission rp ON rp.role_id = rd.id
       JOIN permission_definition pd ON pd.id = rp.permission_id
       WHERE rd.code = $1
       ORDER BY pd.code`,
      [roleCode]
    );
    return rows.rows.map((row) => row.code);
  }

  async appendAuditEvent(input: AuditEventInput): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_event (
        id, tenant_id, resource_type, resource_id, action, actor_kind,
        actor_id, request_id, metadata, occurred_at
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

  private async findPersonForAccount(accountId: string): Promise<Person | null> {
    const rows = await this.db.query<PersonRow>(
      `SELECT p.*
       FROM person p
       JOIN account_person_link apl ON apl.person_id = p.id
       WHERE apl.account_id = $1
       ORDER BY apl.created_at ASC
       LIMIT 1`,
      [accountId]
    );
    return rows.rows[0] === undefined ? null : mapPerson(rows.rows[0]);
  }

  private async findAssignmentsForAccount(accountId: string): Promise<RoleAssignment[]> {
    const rows = await this.db.query<AssignmentRow>(assignmentSql("ra.account_id = $1"), [
      accountId
    ]);
    return rows.rows.map(mapAssignment);
  }

  private async findRoleId(roleCode: RoleCode): Promise<{ id: string }> {
    const rows = await this.db.query<{ id: string }>(
      "SELECT id FROM role_definition WHERE code = $1 LIMIT 1",
      [roleCode]
    );
    const role = rows.rows[0];
    if (role === undefined) {
      throw new NotFoundError("Role definition not found.");
    }
    return role;
  }

  private async countActiveRegionalAdminsForAccount(
    tenantId: string,
    accountId: string
  ): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM role_assignment ra
       JOIN role_definition rd ON rd.id = ra.role_id
       WHERE ra.tenant_id = $1 AND ra.account_id = $2
         AND rd.code = 'REGIONAL_ADMIN'
         AND ra.starts_at <= now()
         AND (ra.ends_at IS NULL OR now() < ra.ends_at)
         AND ra.revoked_at IS NULL`,
      [tenantId, accountId]
    );
    return rows.rows[0]?.count ?? 0;
  }

  private async countAllActiveRegionalAdmins(tenantId: string): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      `SELECT count(DISTINCT ra.account_id)::int AS count
       FROM role_assignment ra
       JOIN role_definition rd ON rd.id = ra.role_id
       JOIN account a ON a.id = ra.account_id
       WHERE ra.tenant_id = $1
         AND rd.code = 'REGIONAL_ADMIN'
         AND a.status = 'ACTIVE'
         AND ra.starts_at <= now()
         AND (ra.ends_at IS NULL OR now() < ra.ends_at)
         AND ra.revoked_at IS NULL`,
      [tenantId]
    );
    return rows.rows[0]?.count ?? 0;
  }
}

function assignmentSql(whereClause: string): string {
  return `SELECT
      ra.id,
      ra.tenant_id,
      ra.account_id,
      ra.role_id,
      rd.code AS role_code,
      COALESCE(array_agg(pd.code ORDER BY pd.code) FILTER (WHERE pd.code IS NOT NULL), '{}') AS permissions,
      ra.scope_type,
      ra.scope_org_id,
      org.path AS scope_path,
      ra.starts_at,
      ra.ends_at,
      ra.granted_by_account_id,
      ra.granted_at,
      ra.revoked_at
    FROM role_assignment ra
    JOIN role_definition rd ON rd.id = ra.role_id
    LEFT JOIN role_permission rp ON rp.role_id = rd.id
    LEFT JOIN permission_definition pd ON pd.id = rp.permission_id
    LEFT JOIN organization org ON org.id = ra.scope_org_id AND org.tenant_id = ra.tenant_id
    WHERE ${whereClause}
    GROUP BY ra.id, rd.code, org.path
    ORDER BY ra.granted_at DESC`;
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    externalIdentityId: row.external_identity_id,
    primaryEmail: row.primary_email,
    status: row.status,
    lastLoginAt: row.last_login_at,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

function mapInvitation(row: InvitationRow): AccountInvitation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    accountId: row.account_id,
    personId: row.person_id,
    email: row.email,
    intendedRoleId: row.intended_role_id,
    intendedRoleCode: row.intended_role_code,
    intendedScopeOrgId: row.intended_scope_org_id,
    status: row.status,
    externalInvitationId: row.external_invitation_id,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    invitedByAccountId: row.invited_by_account_id,
    adultEligibilityAttestedAt: row.adult_eligibility_attested_at,
    adultEligibilityAttestedBy: row.adult_eligibility_attested_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAssignment(row: AssignmentRow): RoleAssignment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    accountId: row.account_id,
    roleId: row.role_id,
    roleCode: row.role_code,
    permissions: row.permissions,
    scopeType: row.scope_type,
    scopeOrgId: row.scope_org_id,
    scopePath: row.scope_path,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    grantedByAccountId: row.granted_by_account_id,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at
  };
}

function mapRequiredAssignment(row: AssignmentRow | undefined): RoleAssignment {
  if (row === undefined) {
    throw new Error("Expected role assignment.");
  }
  return mapAssignment(row);
}
