import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import {
  ConflictError,
  FakeIdentityProvider,
  IdentityUseCases,
  OrganizationUseCases,
  type ActorContext,
  type Clock,
  type IdGenerator
} from "@scouthub/application";
import { createPgIdentityRepository } from "./identity-repository";
import { createPgOrganizationRepository } from "./organization-repository";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://scouthub:scouthub@localhost:5433/scouthub";

const ids = {
  tenant: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  region: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  districtA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
  groupA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  regionB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  districtB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13",
  groupB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  adminAccount: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  adminPerson: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
  adminAssignment: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
  invitedAccount: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
  invitedPerson: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
  invitation: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
  acceptedAssignment: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11"
};

const clock: Clock = {
  now() {
    return new Date(Date.now() + 1_000);
  }
};

describe("PgIdentityRepository", () => {
  beforeEach(async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pool.query(
        "TRUNCATE audit_event, role_assignment, account_invitation, account_person_link, person, account, organization RESTART IDENTITY CASCADE"
      );
    } finally {
      await pool.end();
    }
  });

  it("invites and provisions an adult account idempotently", async () => {
    await createOrganizations();
    const fakeIdentity = new FakeIdentityProvider();
    const useCases = createIdentityUseCases(fakeIdentity, [
      ids.invitedAccount,
      ids.invitedPerson,
      ids.invitation,
      auditId(1),
      auditId(2),
      ids.acceptedAssignment,
      auditId(3),
      auditId(4)
    ]);

    const admin = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });
    expect(admin.account.status).toBe("ACTIVE");

    const invitation = await useCases.inviteAdultUser({
      actor: admin,
      tenantId: ids.tenant,
      email: "leader@example.test",
      firstName: "Leader",
      lastName: "Alpha",
      roleCode: "GROUP_ADMIN",
      scopeOrganizationId: ids.groupA,
      adultEligibilityConfirmed: true
    });
    expect(invitation.status).toBe("PENDING");
    expect(fakeIdentity.createdInvitations[0]?.invitationId).toBe(invitation.id);

    fakeIdentity.setProfile({
      subjectId: "user_leader",
      primaryEmail: "leader@example.test",
      emailVerified: true,
      invitationId: invitation.id
    });
    const actor = await useCases.ensureProvisionedAccount({
      session: {
        sessionId: "sess_leader",
        subjectId: "user_leader",
        assuranceLevel: "standard",
        issuedAt: clock.now(),
        expiresAt: new Date(Date.now() + 3_600_000)
      }
    });
    const again = await useCases.ensureProvisionedAccount({
      session: {
        sessionId: "sess_leader",
        subjectId: "user_leader",
        assuranceLevel: "standard",
        issuedAt: clock.now(),
        expiresAt: new Date(Date.now() + 3_600_000)
      }
    });

    expect(actor.account.id).toBe(again.account.id);
    expect(actor.assignments).toHaveLength(1);
    expect(actor.assignments[0]?.roleCode).toBe("GROUP_ADMIN");
    expect(actor.assignments[0]?.scopeType).toBe("GROUP");
  });

  it("marks invitation failed when Clerk invitation creation fails", async () => {
    await createOrganizations();
    const fakeIdentity = new FakeIdentityProvider();
    fakeIdentity.failInvitationFor("failed@example.test");
    const useCases = createIdentityUseCases(fakeIdentity, [
      ids.invitedAccount,
      ids.invitedPerson,
      ids.invitation,
      auditId(1),
      auditId(2)
    ]);
    const admin = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });

    await expect(
      useCases.inviteAdultUser({
        actor: admin,
        tenantId: ids.tenant,
        email: "failed@example.test",
        firstName: "Fail",
        lastName: "Invite",
        roleCode: "GROUP_ADMIN",
        scopeOrganizationId: ids.groupA,
        adultEligibilityConfirmed: true
      })
    ).rejects.toThrow("Identity invitation failed");

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const failed = await pool.query<{ status: string }>(
        "SELECT status FROM account_invitation WHERE id = $1",
        [ids.invitation]
      );
      const assignments = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM role_assignment WHERE account_id = $1",
        [ids.invitedAccount]
      );
      expect(failed.rows[0]?.status).toBe("FAILED");
      expect(assignments.rows[0]?.count).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it("denies a suspended account even when the provider session is still valid", async () => {
    await createOrganizations();
    const fakeIdentity = new FakeIdentityProvider();
    const useCases = createIdentityUseCases(fakeIdentity, []);
    const admin = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });
    await expect(
      useCases.suspendAccount({
        actor: admin,
        tenantId: ids.tenant,
        accountId: admin.account.id
      })
    ).rejects.toThrow("last active Regional Admin");
  });

  it("does not treat a RegionalAdmin region scope as tenant-wide", async () => {
    await createOrganizations();
    const fakeIdentity = new FakeIdentityProvider();
    const useCases = createIdentityUseCases(fakeIdentity, []);
    const adminA = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin_a",
      email: "admin-a@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });
    const adminB = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.regionB,
      subjectId: "user_admin_b",
      email: "admin-b@example.test",
      firstName: "Binta",
      lastName: "Sarr",
      accountId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      assignmentId: crypto.randomUUID()
    });

    const regionBInvitation = await useCases.inviteAdultUser({
      actor: adminB,
      tenantId: ids.tenant,
      email: "region-b@example.test",
      firstName: "Region",
      lastName: "B",
      roleCode: "GROUP_ADMIN",
      scopeOrganizationId: ids.groupB,
      adultEligibilityConfirmed: true
    });

    await expect(
      useCases.revokeInvitation({
        actor: adminA,
        tenantId: ids.tenant,
        invitationId: regionBInvitation.id
      })
    ).rejects.toThrow("Permission denied");
    await expect(
      useCases.createRoleAssignment({
        actor: adminA,
        tenantId: ids.tenant,
        accountId: adminB.account.id,
        roleCode: "GROUP_ADMIN",
        scopeOrgId: ids.groupB,
        startsAt: clock.now(),
        endsAt: null
      })
    ).rejects.toThrow("Permission denied");
    await expect(
      useCases.suspendAccount({
        actor: adminA,
        tenantId: ids.tenant,
        accountId: adminB.account.id
      })
    ).rejects.toThrow("Permission denied");

    const visibleInvitations = await useCases.listInvitations(adminA, ids.tenant);
    const visibleAssignments = await useCases.listRoleAssignments(adminA, ids.tenant);
    expect(visibleInvitations.map((invitation) => invitation.id)).not.toContain(regionBInvitation.id);
    expect(visibleAssignments.map((assignment) => assignment.accountId)).not.toContain(adminB.account.id);
  });

  it("projects account administration data only within visible tenant and scope", async () => {
    await createOrganizations();
    const fakeIdentity = new FakeIdentityProvider();
    const useCases = createIdentityUseCases(fakeIdentity, []);
    const adminA = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin_a",
      email: "admin-a@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });

    const visibleAccountId = crypto.randomUUID();
    await insertAccountWithRoles({
      accountId: visibleAccountId,
      primaryEmail: "multi@example.test",
      tenantId: ids.tenant,
      personId: crypto.randomUUID(),
      displayName: "Visible Tenant Person",
      assignments: [
        { roleCode: "GROUP_ADMIN", scopeType: "GROUP", scopeOrgId: ids.groupA, startsAt: clock.now(), endsAt: null },
        { roleCode: "GROUP_ADMIN", scopeType: "GROUP", scopeOrgId: ids.groupB, startsAt: clock.now(), endsAt: null }
      ]
    });

    const hiddenAccountId = crypto.randomUUID();
    await insertAccountWithRoles({
      accountId: hiddenAccountId,
      primaryEmail: "hidden@example.test",
      tenantId: ids.tenant,
      personId: crypto.randomUUID(),
      displayName: "Hidden Region Person",
      assignments: [
        {
          roleCode: "GROUP_ADMIN",
          scopeType: "GROUP",
          scopeOrgId: ids.groupA,
          startsAt: new Date("2020-01-01T00:00:00.000Z"),
          endsAt: new Date("2020-02-01T00:00:00.000Z")
        },
        { roleCode: "GROUP_ADMIN", scopeType: "GROUP", scopeOrgId: ids.groupB, startsAt: clock.now(), endsAt: null }
      ]
    });

    const accounts = await useCases.listAccounts(adminA, ids.tenant);
    const visible = accounts.find((entry) => entry.account.id === visibleAccountId);
    expect(visible?.person?.tenantId).toBe(ids.tenant);
    expect(visible?.person?.displayName).toBe("Visible Tenant Person");
    expect(visible?.assignments.map((assignment) => assignment.scopeOrgId)).toEqual([ids.groupA]);
    expect(accounts.map((entry) => entry.account.id)).not.toContain(hiddenAccountId);
  });

  it("serializes and applies the last RegionalAdmin guard to role revocation", async () => {
    await createOrganizations();
    const fakeIdentity = new FakeIdentityProvider();
    const useCases = createIdentityUseCases(fakeIdentity, [auditId(1), auditId(2)]);
    const adminA = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin_a",
      email: "admin-a@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });

    await expect(
      useCases.revokeRoleAssignment({
        actor: adminA,
        tenantId: ids.tenant,
        roleAssignmentId: ids.adminAssignment,
        reason: "test"
      })
    ).rejects.toThrow("last active Regional Admin");

    const second = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin_2",
      email: "admin2@example.test",
      firstName: "Moussa",
      lastName: "Fall",
      accountId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      assignmentId: crypto.randomUUID()
    });
    const revoked = await useCases.revokeRoleAssignment({
      actor: adminA,
      tenantId: ids.tenant,
      roleAssignmentId: second.assignments[0]?.id ?? "",
      reason: "test"
    });
    expect(revoked.revokedAt).not.toBeNull();
    await expect(
      useCases.revokeRoleAssignment({
        actor: adminA,
        tenantId: ids.tenant,
        roleAssignmentId: revoked.id,
        reason: "second"
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await auditCount("identity.role_revoked", revoked.id)).toBe(1);
  });

  it("does not let duplicate RegionalAdmin assignments bypass account suspension guard", async () => {
    await createOrganizations();
    const useCases = createIdentityUseCases(new FakeIdentityProvider(), []);
    const duplicateAssignmentId = crypto.randomUUID();
    const admin = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });
    await insertRegionalAdminAssignment({
      tenantId: ids.tenant,
      accountId: admin.account.id,
      regionOrganizationId: ids.region,
      assignmentId: duplicateAssignmentId,
      startsAt: new Date(Date.now() - 1_000),
      endsAt: null
    });

    await expect(
      useCases.suspendAccount({
        actor: admin,
        tenantId: ids.tenant,
        accountId: admin.account.id
      })
    ).rejects.toThrow("last active Regional Admin");
  });

  it("allows revoking one duplicate RegionalAdmin assignment when another remains effective", async () => {
    await createOrganizations();
    const useCases = createIdentityUseCases(new FakeIdentityProvider(), [auditId(1)]);
    const duplicateAssignmentId = crypto.randomUUID();
    const admin = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });
    await insertRegionalAdminAssignment({
      tenantId: ids.tenant,
      accountId: admin.account.id,
      regionOrganizationId: ids.region,
      assignmentId: duplicateAssignmentId,
      startsAt: new Date(Date.now() - 1_000),
      endsAt: null
    });

    const revoked = await useCases.revokeRoleAssignment({
      actor: admin,
      tenantId: ids.tenant,
      roleAssignmentId: ids.adminAssignment,
      reason: "duplicate cleanup"
    });

    expect(revoked.revokedAt).not.toBeNull();
    expect(await activeRegionalAdminAssignmentExists(duplicateAssignmentId)).toBe(true);
  });

  it("allows suspending one RegionalAdmin account when another active account remains", async () => {
    await createOrganizations();
    const fakeIdentity = new FakeIdentityProvider();
    const useCases = createIdentityUseCases(fakeIdentity, [auditId(1)]);
    const adminA = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin_a",
      email: "admin-a@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });
    await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin_b",
      email: "admin-b@example.test",
      firstName: "Binta",
      lastName: "Sarr",
      accountId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      assignmentId: crypto.randomUUID()
    });

    const suspended = await useCases.suspendAccount({
      actor: adminA,
      tenantId: ids.tenant,
      accountId: adminA.account.id
    });

    expect(suspended.status).toBe("SUSPENDED");
    expect(await effectiveRegionalAdminAccountCount(ids.tenant, ids.region)).toBe(1);
  });

  it("does not count non-effective RegionalAdmin assignments as remaining access", async () => {
    await createOrganizations();
    const useCases = createIdentityUseCases(new FakeIdentityProvider(), []);
    const admin = await createRegionalAdminFixture(useCases, {
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye",
      accountId: ids.adminAccount,
      personId: ids.adminPerson,
      assignmentId: ids.adminAssignment
    });
    await insertAccountWithRoles({
      accountId: crypto.randomUUID(),
      primaryEmail: "inactive-admin@example.test",
      tenantId: ids.tenant,
      personId: crypto.randomUUID(),
      displayName: "Inactive Admin",
      accountStatus: "SUSPENDED",
      assignments: [
        {
          roleCode: "REGIONAL_ADMIN",
          scopeOrgId: ids.region,
          startsAt: new Date(Date.now() - 1_000),
          endsAt: null
        }
      ]
    });
    await insertAccountWithRoles({
      accountId: crypto.randomUUID(),
      primaryEmail: "non-effective@example.test",
      tenantId: ids.tenant,
      personId: crypto.randomUUID(),
      displayName: "Non Effective Admin",
      assignments: [
        {
          roleCode: "REGIONAL_ADMIN",
          scopeOrgId: ids.region,
          startsAt: new Date("2020-01-01T00:00:00.000Z"),
          endsAt: new Date("2020-02-01T00:00:00.000Z")
        },
        {
          roleCode: "REGIONAL_ADMIN",
          scopeOrgId: ids.region,
          startsAt: new Date(Date.now() + 3_600_000),
          endsAt: null
        },
        {
          roleCode: "REGIONAL_ADMIN",
          scopeOrgId: ids.region,
          startsAt: new Date(Date.now() - 1_000),
          endsAt: null,
          revokedAt: new Date(Date.now() - 500)
        }
      ]
    });

    await expect(
      useCases.revokeRoleAssignment({
        actor: admin,
        tenantId: ids.tenant,
        roleAssignmentId: ids.adminAssignment,
        reason: "test"
      })
    ).rejects.toThrow("last active Regional Admin");
  });
});

async function createRegionalAdminFixture(
  useCases: IdentityUseCases,
  input: {
    readonly tenantId: string;
    readonly regionOrganizationId: string;
    readonly subjectId: string;
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly accountId: string;
    readonly personId: string;
    readonly assignmentId: string;
  }
): Promise<ActorContext> {
  await insertAccountWithRoles({
    accountId: input.accountId,
    primaryEmail: input.email,
    externalIdentityId: input.subjectId,
    tenantId: input.tenantId,
    personId: input.personId,
    displayName: `${input.firstName} ${input.lastName}`,
    assignments: [
      {
        id: input.assignmentId,
        roleCode: "REGIONAL_ADMIN",
        scopeOrgId: input.regionOrganizationId,
        startsAt: new Date(Date.now() - 1_000),
        endsAt: null
      }
    ]
  });
  return useCases.ensureProvisionedAccount({
    session: {
      sessionId: `sess_${input.subjectId}`,
      subjectId: input.subjectId,
      assuranceLevel: "standard",
      issuedAt: clock.now(),
      expiresAt: new Date(Date.now() + 3_600_000)
    }
  });
}

async function insertAccountWithRoles(input: {
  readonly accountId: string;
  readonly primaryEmail: string;
  readonly externalIdentityId?: string;
  readonly tenantId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly accountStatus?: "ACTIVE" | "SUSPENDED";
    readonly assignments: readonly {
    readonly id?: string;
    readonly roleCode: string;
    readonly scopeType?: string;
    readonly scopeOrgId: string;
    readonly startsAt: Date;
    readonly endsAt: Date | null;
    readonly revokedAt?: Date | null;
  }[];
}): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query(
      `INSERT INTO account (id, external_identity_id, primary_email, status, email_verified_at)
       VALUES ($1, $2, $3, $4, now())`,
      [input.accountId, input.externalIdentityId ?? null, input.primaryEmail, input.accountStatus ?? "ACTIVE"]
    );
    await pool.query(
      `INSERT INTO person (id, tenant_id, first_name, last_name, display_name)
       VALUES ($1, $2, 'Test', 'User', $3)`,
      [input.personId, input.tenantId, input.displayName]
    );
    await pool.query(
      "INSERT INTO account_person_link (account_id, tenant_id, person_id) VALUES ($1, $2, $3)",
      [input.accountId, input.tenantId, input.personId]
    );
    for (const assignment of input.assignments) {
      const role = await pool.query<{ id: string }>(
        "SELECT id FROM role_definition WHERE code = $1",
        [assignment.roleCode]
      );
      await pool.query(
        `INSERT INTO role_assignment (
          id, tenant_id, account_id, role_id, scope_type, scope_org_id,
          starts_at, ends_at, granted_by_account_id, revoked_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $3, $9)`,
        [
          assignment.id ?? crypto.randomUUID(),
          input.tenantId,
          input.accountId,
          role.rows[0]?.id,
          assignment.scopeType ?? "REGION",
          assignment.scopeOrgId,
          assignment.startsAt,
          assignment.endsAt,
          assignment.revokedAt ?? null
        ]
      );
    }
  } finally {
    await pool.end();
  }
}

async function insertRegionalAdminAssignment(input: {
  readonly tenantId: string;
  readonly accountId: string;
  readonly regionOrganizationId: string;
  readonly assignmentId: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
}): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const role = await pool.query<{ id: string }>(
      "SELECT id FROM role_definition WHERE code = 'REGIONAL_ADMIN'"
    );
    await pool.query(
      `INSERT INTO role_assignment (
        id, tenant_id, account_id, role_id, scope_type, scope_org_id,
        starts_at, ends_at, granted_by_account_id
      )
       VALUES ($1, $2, $3, $4, 'REGION', $5, $6, $7, $3)`,
      [
        input.assignmentId,
        input.tenantId,
        input.accountId,
        role.rows[0]?.id,
        input.regionOrganizationId,
        input.startsAt,
        input.endsAt
      ]
    );
  } finally {
    await pool.end();
  }
}

async function activeRegionalAdminAssignmentExists(assignmentId: string): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const rows = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM role_assignment
        WHERE id = $1 AND revoked_at IS NULL
      ) AS exists`,
      [assignmentId]
    );
    return rows.rows[0]?.exists === true;
  } finally {
    await pool.end();
  }
}

async function effectiveRegionalAdminAccountCount(
  tenantId: string,
  regionOrganizationId: string
): Promise<number> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const rows = await pool.query<{ count: number }>(
      `SELECT count(DISTINCT ra.account_id)::int AS count
       FROM role_assignment ra
       JOIN role_definition rd ON rd.id = ra.role_id
       JOIN account a ON a.id = ra.account_id
       WHERE ra.tenant_id = $1
         AND rd.code = 'REGIONAL_ADMIN'
         AND a.status = 'ACTIVE'
         AND ra.scope_org_id = $2
         AND ra.starts_at <= now()
         AND (ra.ends_at IS NULL OR now() < ra.ends_at)
         AND ra.revoked_at IS NULL`,
      [tenantId, regionOrganizationId]
    );
    return rows.rows[0]?.count ?? 0;
  } finally {
    await pool.end();
  }
}

async function auditCount(action: string, resourceId: string): Promise<number> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const rows = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM audit_event WHERE action = $1 AND resource_id = $2",
      [action, resourceId]
    );
    return rows.rows[0]?.count ?? 0;
  } finally {
    await pool.end();
  }
}

async function createOrganizations(): Promise<void> {
  const orgUseCases = new OrganizationUseCases(
    createPgOrganizationRepository(databaseUrl),
    organizationIds([ids.tenant, ids.region, ids.districtA, ids.groupA, ids.regionB, ids.districtB, ids.groupB])
  );
  await orgUseCases.createTenantRoot({ name: "Tenant Alpha", code: "TENANT" });
  await orgUseCases.createOrganization({
    tenantId: ids.tenant,
    parentId: ids.tenant,
    type: "REGION",
    name: "Region Alpha",
    code: "REGION"
  });
  await orgUseCases.createOrganization({
    tenantId: ids.tenant,
    parentId: ids.region,
    type: "DISTRICT",
    name: "District Alpha",
    code: "DISTRICT-A"
  });
  await orgUseCases.createOrganization({
    tenantId: ids.tenant,
    parentId: ids.districtA,
    type: "GROUP",
    name: "Group A",
    code: "GROUP-A"
  });
  await orgUseCases.createOrganization({
    tenantId: ids.tenant,
    parentId: ids.tenant,
    type: "REGION",
    name: "Region Beta",
    code: "REGION-B"
  });
  await orgUseCases.createOrganization({
    tenantId: ids.tenant,
    parentId: ids.regionB,
    type: "DISTRICT",
    name: "District Beta",
    code: "DISTRICT-B"
  });
  await orgUseCases.createOrganization({
    tenantId: ids.tenant,
    parentId: ids.districtB,
    type: "GROUP",
    name: "Group B",
    code: "GROUP-B"
  });
}

function createIdentityUseCases(
  fakeIdentity: FakeIdentityProvider,
  values: string[]
): IdentityUseCases {
  return new IdentityUseCases(
    createPgIdentityRepository(databaseUrl),
    fakeIdentity,
    fixedIds(values),
    clock,
    "http://localhost:3000"
  );
}

function fixedIds(values: string[]): IdGenerator {
  const remaining = [...values];
  return {
    generate() {
      const next = remaining.shift();
      if (next !== undefined) {
        return next;
      }
      return crypto.randomUUID();
    }
  };
}

function organizationIds(values: string[]): IdGenerator {
  const remaining = [...values];
  let call = 0;
  return {
    generate() {
      call += 1;
      if (call % 2 === 1) {
        const next = remaining.shift();
        if (next !== undefined) {
          return next;
        }
      }
      return crypto.randomUUID();
    }
  };
}

function auditId(index: number): string {
  return `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, "0")}`;
}
