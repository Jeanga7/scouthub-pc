import {
  canProvisionInvitation,
  displayNameFor,
  isRoleAssignmentActive,
  type Account,
  type AccountInvitation,
  type PermissionCode,
  type RoleAssignment,
  type RoleCode,
  type RoleScopeType
} from "@scouthub/domain";
import { ConflictError, NotFoundError, ValidationError } from "../organization/errors";
import {
  createAuditEvent,
  type RequestContext
} from "../organization/audit";
import type { IdGenerator } from "../organization/use-cases";
import type { IdentityProvider, IdentitySession } from "../ports/identity-provider";
import type {
  ActorContext,
  IdentityRepository
} from "../ports/identity-repository";

export interface Clock {
  now(): Date;
}

export interface EnsureAuthenticatedActorInput extends RequestContext {
  readonly request: Request;
}

export interface InviteAdultUserInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roleCode: RoleCode;
  readonly scopeOrganizationId: string;
  readonly adultEligibilityConfirmed: boolean;
}

export interface EnsureProvisionedAccountInput extends RequestContext {
  readonly session: IdentitySession;
}

export interface CreateRoleAssignmentUseCaseInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly accountId: string;
  readonly roleCode: RoleCode;
  readonly scopeType: RoleScopeType;
  readonly scopeOrgId: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
}

export class IdentityUseCases {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly identityProvider: IdentityProvider,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly appOrigin: string
  ) {}

  async getSession(request: Request): Promise<IdentitySession | null> {
    const session = await this.identityProvider.getSession(request);
    if (session === null || session.expiresAt <= this.clock.now()) {
      return null;
    }
    return session;
  }

  async ensureAuthenticatedActor(
    input: EnsureAuthenticatedActorInput
  ): Promise<ActorContext> {
    const session = await this.getSession(input.request);
    if (session === null) {
      throw new ValidationError("Authentication required.", "AUTH_REQUIRED", 401);
    }
    return this.ensureProvisionedAccount({ session, requestId: input.requestId });
  }

  async ensureProvisionedAccount(
    input: EnsureProvisionedAccountInput
  ): Promise<ActorContext> {
    const existing = await this.repository.transaction((transaction) =>
      transaction.findActorBySubject(input.session.subjectId)
    );
    if (existing !== null) {
      if (existing.account.status === "ACTIVE") {
        return { ...existing, assuranceLevel: input.session.assuranceLevel };
      }
      const tenantId = existing.assignments[0]?.tenantId ?? existing.person?.tenantId;
      if (tenantId !== undefined) {
        await this.repository.transaction((transaction) =>
          transaction.appendAuditEvent(
            createIdentityAuditEvent({
              id: this.ids.generate(),
              tenantId,
              resourceType: "account",
              resourceId: existing.account.id,
              action: "identity.login_denied_suspended",
              metadata: { account_status: existing.account.status },
              requestId: input.requestId
            })
          )
        );
      }
      throw new ValidationError("Account is not allowed to access ScoutHub-PC.", "ACCOUNT_DENIED", 403);
    }

    const profile = await this.identityProvider.getIdentityProfile(input.session.subjectId);
    if (profile === null || profile.invitationId === null) {
      throw new ValidationError("No ScoutHub account is linked to this identity.", "ACCOUNT_NOT_PROVISIONED", 403);
    }
    const invitationId = profile.invitationId;

    return this.repository.transaction(async (transaction) => {
      const invitation = await transaction.findInvitationForUpdate(invitationId);
      if (invitation === null) {
        throw new ValidationError("Invitation metadata is unknown.", "INVITATION_UNKNOWN", 403);
      }
      if (!canProvisionInvitation(invitation, this.clock.now())) {
        throw new ValidationError("Invitation cannot be accepted.", "INVITATION_NOT_PENDING", 403);
      }
      if (!profile.emailVerified) {
        throw new ValidationError("Verified email is required.", "EMAIL_NOT_VERIFIED", 403);
      }
      if (profile.primaryEmail.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new ValidationError("Identity email does not match invitation.", "EMAIL_MISMATCH", 403);
      }
      const alreadyLinked = await transaction.findAccountBySubjectForUpdate(profile.subjectId);
      if (alreadyLinked !== null) {
        throw new ConflictError("Identity subject is already linked to an account.");
      }

      const actor = await transaction.acceptInvitation({
        invitationId: invitation.id,
        subjectId: profile.subjectId,
        emailVerifiedAt: this.clock.now(),
        roleAssignmentId: this.ids.generate()
      });
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: invitation.tenantId,
          resourceType: "account",
          resourceId: invitation.accountId,
          action: "identity.account_provisioned",
          metadata: { invitation_id: invitation.id },
          requestId: input.requestId
        })
      );
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: invitation.tenantId,
          resourceType: "invitation",
          resourceId: invitation.id,
          action: "identity.invitation_accepted",
          metadata: {},
          requestId: input.requestId
        })
      );
      return { ...actor, assuranceLevel: input.session.assuranceLevel };
    });
  }

  async inviteAdultUser(input: InviteAdultUserInput): Promise<AccountInvitation> {
    assertPermission(input.actor, input.tenantId, "invitation.create", this.clock.now());
    if (!input.adultEligibilityConfirmed) {
      throw new ValidationError("Adult eligibility must be explicitly confirmed.", "ADULT_ELIGIBILITY_REQUIRED");
    }
    if (input.roleCode === "PLATFORM_ADMIN" || input.roleCode === "NATIONAL_OBSERVER") {
      throw new ValidationError("Requested role cannot be granted by this flow.", "ROLE_GRANT_FORBIDDEN");
    }

    const scope = await this.repository.transaction((transaction) =>
      transaction.findOrganizationResource(input.tenantId, input.scopeOrganizationId)
    );
    if (scope === null || !canActorReachPath(input.actor, input.tenantId, scope.path, this.clock.now())) {
      throw new ValidationError("Invitation scope is outside actor permissions.", "SCOPE_FORBIDDEN", 403);
    }

    const draft = await this.repository.transaction(async (transaction) => {
      const created = await transaction.createInvitationDraft({
        tenantId: input.tenantId,
        email: input.email.trim().toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        roleCode: input.roleCode,
        scopeOrganizationId: input.scopeOrganizationId,
        invitedByAccountId: input.actor.account.id,
        expiresAt: addDays(this.clock.now(), 30),
        adultEligibilityAttestedAt: this.clock.now(),
        ids: {
          accountId: this.ids.generate(),
          personId: this.ids.generate(),
          invitationId: this.ids.generate()
        }
      });
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceType: "invitation",
          resourceId: created.invitation.id,
          action: "identity.invitation_requested",
          metadata: { role: input.roleCode, scope_org_id: input.scopeOrganizationId },
          requestId: input.requestId
        })
      );
      return created;
    });

    try {
      const external = await this.identityProvider.createInvitation({
        email: draft.invitation.email,
        redirectUrl: `${this.appOrigin}/sign-up`,
        invitationId: draft.invitation.id,
        expiresInDays: 30
      });
      return await this.repository.transaction(async (transaction) => {
        const invitation = await transaction.markInvitationPending(
          draft.invitation.id,
          external.externalInvitationId
        );
        await transaction.appendAuditEvent(
          createIdentityAuditEvent({
            id: this.ids.generate(),
            tenantId: input.tenantId,
            resourceType: "invitation",
            resourceId: invitation.id,
            action: "identity.invitation_sent",
            metadata: {},
            requestId: input.requestId
          })
        );
        return invitation;
      });
    } catch (error) {
      await this.repository.transaction(async (transaction) => {
        await transaction.markInvitationFailed(draft.invitation.id);
        await transaction.appendAuditEvent(
          createIdentityAuditEvent({
            id: this.ids.generate(),
            tenantId: input.tenantId,
            resourceType: "invitation",
            resourceId: draft.invitation.id,
            action: "identity.invitation_failed",
            metadata: {},
            requestId: input.requestId
          })
        );
      });
      throw error;
    }
  }

  async listInvitations(actor: ActorContext, tenantId: string): Promise<AccountInvitation[]> {
    assertPermission(actor, tenantId, "invitation.read", this.clock.now());
    return this.repository.transaction((transaction) => transaction.listInvitations(tenantId));
  }

  async revokeInvitation(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly invitationId: string;
    readonly requestId?: string;
  }): Promise<AccountInvitation> {
    assertPermission(input.actor, input.tenantId, "invitation.revoke", this.clock.now());
    const invitation = await this.repository.transaction(async (transaction) => {
      const revoked = await transaction.revokeInvitation({
        tenantId: input.tenantId,
        invitationId: input.invitationId,
        revokedByAccountId: input.actor.account.id
      });
      if (revoked === null) {
        throw new NotFoundError("Invitation not found.");
      }
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceType: "invitation",
          resourceId: revoked.id,
          action: "identity.invitation_revoked",
          metadata: {},
          requestId: input.requestId
        })
      );
      return revoked;
    });

    if (invitation.externalInvitationId !== null) {
      await this.identityProvider.revokeInvitation(invitation.externalInvitationId);
    }
    return invitation;
  }

  async listRoleAssignments(actor: ActorContext, tenantId: string): Promise<RoleAssignment[]> {
    assertPermission(actor, tenantId, "role.read", this.clock.now());
    return this.repository.transaction((transaction) => transaction.listRoleAssignments(tenantId));
  }

  async revokeRoleAssignment(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly roleAssignmentId: string;
    readonly reason: string | null;
    readonly requestId?: string;
  }): Promise<RoleAssignment> {
    assertPermission(input.actor, input.tenantId, "role.revoke", this.clock.now());
    const assignment = await this.repository.transaction(async (transaction) => {
      const revoked = await transaction.revokeRoleAssignment({
        tenantId: input.tenantId,
        roleAssignmentId: input.roleAssignmentId,
        revokedByAccountId: input.actor.account.id,
        reason: input.reason
      });
      if (revoked === null) {
        throw new NotFoundError("Role assignment not found.");
      }
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceType: "role_assignment",
          resourceId: revoked.id,
          action: "identity.role_revoked",
          metadata: { reason: input.reason },
          requestId: input.requestId
        })
      );
      return revoked;
    });
    return assignment;
  }

  async createRoleAssignment(
    input: CreateRoleAssignmentUseCaseInput
  ): Promise<RoleAssignment> {
    assertPermission(input.actor, input.tenantId, "role.assign", this.clock.now());
    if (input.roleCode === "PLATFORM_ADMIN" || input.scopeType === "NATIONAL") {
      throw new ValidationError("Role assignment is outside Slice 2 grant policy.", "ROLE_GRANT_FORBIDDEN");
    }
    return this.repository.transaction(async (transaction) => {
      if (input.scopeOrgId !== null) {
        const scope = await transaction.findOrganizationResource(input.tenantId, input.scopeOrgId);
        if (scope === null || !canActorReachPath(input.actor, input.tenantId, scope.path, this.clock.now())) {
          throw new ValidationError("Role scope is outside actor permissions.", "SCOPE_FORBIDDEN", 403);
        }
      }
      const assignment = await transaction.createRoleAssignment({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        accountId: input.accountId,
        roleCode: input.roleCode,
        scopeType: input.scopeType,
        scopeOrgId: input.scopeOrgId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        grantedByAccountId: input.actor.account.id
      });
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceType: "role_assignment",
          resourceId: assignment.id,
          action: "identity.role_assigned",
          metadata: { role: assignment.roleCode, scope_org_id: assignment.scopeOrgId },
          requestId: input.requestId
        })
      );
      return assignment;
    });
  }

  async suspendAccount(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly accountId: string;
    readonly requestId?: string;
  }): Promise<Account> {
    assertPermission(input.actor, input.tenantId, "account.suspend", this.clock.now());
    const account = await this.repository.transaction(async (transaction) => {
      const target = await transaction.suspendAccount({
        tenantId: input.tenantId,
        accountId: input.accountId
      });
      if (target === null) {
        throw new NotFoundError("Account not found.");
      }
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceType: "account",
          resourceId: target.id,
          action: "identity.account_suspended",
          metadata: {},
          requestId: input.requestId
        })
      );
      return target;
    });

    if (account.externalIdentityId !== null) {
      await this.identityProvider.suspendIdentity(account.externalIdentityId);
    }
    return account;
  }

  async bootstrapRegionalAdmin(input: {
    readonly tenantId: string;
    readonly regionOrganizationId: string;
    readonly subjectId: string;
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly requestId?: string;
  }): Promise<ActorContext> {
    const existingCount = await this.repository.transaction((transaction) =>
      transaction.countActiveRegionalAdmins(
        input.tenantId,
        input.regionOrganizationId,
        this.clock.now()
      )
    );
    if (existingCount > 0) {
      throw new ConflictError("A Regional Admin already exists for this region.");
    }

    return this.repository.transaction(async (transaction) => {
      const actor = await transaction.bootstrapRegionalAdmin({
        tenantId: input.tenantId,
        regionOrganizationId: input.regionOrganizationId,
        subjectId: input.subjectId,
        email: input.email.trim().toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        ids: {
          accountId: this.ids.generate(),
          personId: this.ids.generate(),
          roleAssignmentId: this.ids.generate()
        }
      });
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceType: "role_assignment",
          resourceId: actor.account.id,
          action: "identity.role_assigned",
          metadata: { role: "REGIONAL_ADMIN", bootstrap: true },
          requestId: input.requestId
        })
      );
      return actor;
    });
  }
}

function assertPermission(
  actor: ActorContext,
  tenantId: string,
  permission: PermissionCode,
  now: Date
): void {
  const allowed = actor.assignments.some(
    (assignment) =>
      assignment.tenantId === tenantId &&
      assignment.roleCode !== "PLATFORM_ADMIN" &&
      isRoleAssignmentActive(assignment, now) &&
      assignment.permissions.includes(permission)
  );
  if (!allowed) {
    throw new ValidationError("Permission denied.", "AUTHZ_DENIED", 403);
  }
}

function canActorReachPath(
  actor: ActorContext,
  tenantId: string,
  path: string,
  now: Date
): boolean {
  return actor.assignments.some(
    (assignment) =>
      assignment.tenantId === tenantId &&
      isRoleAssignmentActive(assignment, now) &&
      assignment.scopePath !== null &&
      path.startsWith(assignment.scopePath)
  );
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function createIdentityAuditEvent(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceType: "account" | "invitation" | "role_assignment";
  readonly resourceId: string;
  readonly action:
    | "identity.invitation_requested"
    | "identity.invitation_sent"
    | "identity.invitation_failed"
    | "identity.invitation_revoked"
    | "identity.invitation_accepted"
    | "identity.account_provisioned"
    | "identity.account_suspended"
    | "identity.role_assigned"
    | "identity.role_revoked"
    | "identity.login_denied_suspended";
  readonly metadata: Record<string, unknown>;
  readonly requestId?: string;
}) {
  return createAuditEvent(input);
}

export { displayNameFor };
