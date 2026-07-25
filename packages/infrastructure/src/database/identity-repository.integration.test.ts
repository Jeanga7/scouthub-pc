import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import {
  FakeIdentityProvider,
  IdentityUseCases,
  OrganizationUseCases,
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
  groupA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  regionB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  groupB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04",
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

  it("bootstraps, invites and provisions an adult account idempotently", async () => {
    await createOrganizations();
    const fakeIdentity = new FakeIdentityProvider();
    const useCases = createIdentityUseCases(fakeIdentity, [
      ids.adminAccount,
      ids.adminPerson,
      ids.adminAssignment,
      auditId(1),
      ids.invitedAccount,
      ids.invitedPerson,
      ids.invitation,
      auditId(2),
      auditId(3),
      ids.acceptedAssignment,
      auditId(4),
      auditId(5)
    ]);

    const admin = await useCases.bootstrapRegionalAdmin({
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye"
    });
    expect(admin.account.status).toBe("ACTIVE");
    await expect(
      useCases.bootstrapRegionalAdmin({
        tenantId: ids.tenant,
        regionOrganizationId: ids.region,
        subjectId: "user_admin_2",
        email: "admin2@example.test",
        firstName: "Moussa",
        lastName: "Fall"
      })
    ).rejects.toThrow("already exists");

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
      ids.adminAccount,
      ids.adminPerson,
      ids.adminAssignment,
      auditId(1),
      ids.invitedAccount,
      ids.invitedPerson,
      ids.invitation,
      auditId(2),
      auditId(3)
    ]);
    const admin = await useCases.bootstrapRegionalAdmin({
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye"
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
    const useCases = createIdentityUseCases(fakeIdentity, [
      ids.adminAccount,
      ids.adminPerson,
      ids.adminAssignment,
      auditId(1)
    ]);
    const admin = await useCases.bootstrapRegionalAdmin({
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin",
      email: "admin@example.test",
      firstName: "Awa",
      lastName: "Ndiaye"
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
    const useCases = createIdentityUseCases(fakeIdentity, [
      ids.adminAccount,
      ids.adminPerson,
      ids.adminAssignment,
      auditId(1)
    ]);
    const adminA = await useCases.bootstrapRegionalAdmin({
      tenantId: ids.tenant,
      regionOrganizationId: ids.region,
      subjectId: "user_admin_a",
      email: "admin-a@example.test",
      firstName: "Awa",
      lastName: "Ndiaye"
    });
    const adminB = await useCases.bootstrapRegionalAdmin({
      tenantId: ids.tenant,
      regionOrganizationId: ids.regionB,
      subjectId: "user_admin_b",
      email: "admin-b@example.test",
      firstName: "Binta",
      lastName: "Sarr"
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
});

async function createOrganizations(): Promise<void> {
  const orgUseCases = new OrganizationUseCases(
    createPgOrganizationRepository(databaseUrl),
    organizationIds([ids.tenant, ids.region, ids.groupA, ids.regionB, ids.groupB])
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
