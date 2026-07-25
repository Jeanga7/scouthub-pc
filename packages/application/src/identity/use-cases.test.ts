import { describe, expect, it } from "vitest";
import { FakeIdentityProvider } from "../ports/fake-identity-provider";
import type {
  Account,
  AccountInvitation,
  Person,
  RoleAssignment
} from "@scouthub/domain";
import type {
  ActorContext,
  CreatedInvitationDraft,
  IdentityRepository,
  IdentityTransaction,
  InviteAdultUserRecord,
  ScopedOrganizationResource
} from "../ports/identity-repository";
import { IdentityUseCases, type Clock } from "./use-cases";

const now = new Date("2026-01-01T00:00:00.000Z");
const clock: Clock = { now: () => now };

describe("IdentityUseCases", () => {
  it("keeps the original DB error when external invitation cleanup also fails", async () => {
    const identityProvider = new FakeIdentityProvider();
    identityProvider.failNextRevocation();
    const dbError = new Error("DB pending transition failed");
    const repository = new PendingFailureRepository(dbError);
    const useCases = new IdentityUseCases(
      repository,
      identityProvider,
      { generate: () => crypto.randomUUID() },
      clock,
      "http://localhost:3000"
    );

    await expect(
      useCases.inviteAdultUser({
        actor: regionalAdminActor(),
        tenantId: tenantId,
        email: "leader@example.test",
        firstName: "Leader",
        lastName: "One",
        roleCode: "GROUP_ADMIN",
        scopeOrganizationId: groupId,
        adultEligibilityConfirmed: true
      })
    ).rejects.toBe(dbError);

    expect(identityProvider.createdInvitations).toHaveLength(1);
    expect(identityProvider.revokedInvitations).toEqual([
      `inv_${identityProvider.createdInvitations[0]?.invitationId}`
    ]);
    expect(repository.failedMarked).toBe(true);
  });
});

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const regionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const regionPath = `/${tenantId}/${regionId}/`;
const groupPath = `/${tenantId}/${regionId}/${groupId}/`;

class PendingFailureRepository implements IdentityRepository {
  readonly invitation = invitationRecord();
  failedMarked = false;

  constructor(readonly dbError: Error) {}

  async transaction<TResult>(
    handler: (transaction: IdentityTransaction) => Promise<TResult>
  ): Promise<TResult> {
    return handler(new PendingFailureTransaction(this));
  }
}

class PendingFailureTransaction implements IdentityTransaction {
  constructor(private readonly repository: PendingFailureRepository) {}

  findActorBySubject = unexpected;
  findActorBySubjectForUpdate = unexpected;
  findAccountById = unexpected;
  findAccountBySubjectForUpdate = unexpected;
  findInvitationForUpdate = unexpected;
  acceptInvitation = unexpected;
  listInvitations = unexpected;
  listInvitationsForScopes = unexpected;
  revokeInvitation = unexpected;
  listRoleAssignments = unexpected;
  listRoleAssignmentsForScopes = unexpected;
  createRoleAssignment = unexpected;
  findRoleAssignmentForUpdate = unexpected;
  revokeRoleAssignment = unexpected;
  suspendAccount = unexpected;
  listAccountsForScopes = unexpected;
  findAccountAdministrationView = unexpected;
  findAccountAdministrationViewForUpdate = unexpected;
  countActiveRegionalAdmins = unexpected;
  getRolePermissions = unexpected;

  createInvitationDraft(input: InviteAdultUserRecord): Promise<CreatedInvitationDraft> {
    return Promise.resolve({
      invitation: {
        ...this.repository.invitation,
        id: input.ids.invitationId,
        accountId: input.ids.accountId,
        personId: input.ids.personId
      },
      roleId: "role_group_admin"
    });
  }

  markInvitationPending(): Promise<AccountInvitation> {
    return Promise.reject(this.repository.dbError);
  }

  simulateNextPendingFailure(): void {}

  markInvitationFailed(): Promise<void> {
    this.repository.failedMarked = true;
    return Promise.resolve();
  }

  findOrganizationResource(): Promise<ScopedOrganizationResource> {
    return Promise.resolve({
      tenantId,
      organizationId: groupId,
      type: "GROUP",
      path: groupPath
    });
  }

  appendAuditEvent(): Promise<void> {
    return Promise.resolve();
  }
}

function unexpected(): Promise<never> {
  return Promise.reject(new Error("Unexpected repository call."));
}

function regionalAdminActor(): ActorContext {
  return {
    account: accountRecord("admin_account", "admin@example.test"),
    person: personRecord(),
    assignments: [
      {
        id: "assignment_admin",
        tenantId,
        accountId: "admin_account",
        roleId: "role_regional_admin",
        roleCode: "REGIONAL_ADMIN",
        permissions: ["invitation.create"],
        scopeType: "REGION",
        scopeOrgId: regionId,
        scopePath: regionPath,
        startsAt: new Date("2025-01-01T00:00:00.000Z"),
        endsAt: null,
        grantedByAccountId: null,
        grantedAt: now,
        revokedAt: null
      } satisfies RoleAssignment
    ],
    assuranceLevel: "standard"
  };
}

function accountRecord(id: string, primaryEmail: string): Account {
  return {
    id,
    externalIdentityId: null,
    primaryEmail,
    status: "ACTIVE",
    lastLoginAt: null,
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function personRecord(): Person {
  return {
    id: "person_admin",
    tenantId,
    firstName: "Admin",
    lastName: "User",
    displayName: "Admin User",
    birthDate: null,
    classification: "P2",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now
  };
}

function invitationRecord(): AccountInvitation {
  return {
    id: "invitation",
    tenantId,
    accountId: "invited_account",
    personId: "invited_person",
    email: "leader@example.test",
    intendedRoleId: "role_group_admin",
    intendedRoleCode: "GROUP_ADMIN",
    intendedScopeOrgId: groupId,
    status: "CREATING",
    externalInvitationId: null,
    expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    acceptedAt: null,
    revokedAt: null,
    invitedByAccountId: "admin_account",
    adultEligibilityAttestedAt: now,
    adultEligibilityAttestedBy: "admin_account",
    createdAt: now,
    updatedAt: now
  };
}
