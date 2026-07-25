import {
  canProvisionInvitation,
  displayNameFor,
  isRoleAssignmentActive,
  type Account,
  type AccountInvitation,
  type RoleAssignment,
  type RoleCode,
  type RoleScopeType
} from "@scouthub/domain";
import {
  canAccessScopedAction,
  validateSlice2RoleScope,
  type OrganizationResource
} from "@scouthub/authz";
import { ConflictError, NotFoundError, ValidationError } from "../organization/errors";
import {
  createAuditEvent,
  type RequestContext
} from "../organization/audit";
import type { IdGenerator } from "../organization/use-cases";
import type { IdentityProvider, IdentitySession } from "../ports/identity-provider";
import type {
  ActorContext,
  AccountAdministrationView,
  IdentityRepository,
  IdentityTransaction,
  ScopedOrganizationResource
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
    if (session.impersonated === true) {
      throw new ValidationError("Impersonated provider sessions are not allowed.", "AUTH_IMPERSONATION_FORBIDDEN", 403);
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
              requestId: input.requestId,
              auditActor: { kind: "USER", id: existing.account.id }
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
      const invitationScope = await transaction.findOrganizationResource(
        invitation.tenantId,
        invitation.intendedScopeOrgId
      );
      if (invitationScope === null) {
        throw new ValidationError("Invitation scope is no longer available.", "INVITATION_SCOPE_MISSING", 403);
      }

      const actor = await transaction.acceptInvitation({
        invitationId: invitation.id,
        subjectId: profile.subjectId,
        emailVerifiedAt: this.clock.now(),
        roleAssignmentId: this.ids.generate(),
        scopeType: assertRoleScope(invitation.intendedRoleCode, invitationScope)
      });
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: invitation.tenantId,
          resourceType: "account",
          resourceId: invitation.accountId,
          action: "identity.account_provisioned",
          metadata: { invitation_id: invitation.id },
          requestId: input.requestId,
          auditActor: { kind: "USER", id: invitation.accountId }
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
          requestId: input.requestId,
          auditActor: { kind: "USER", id: invitation.accountId }
        })
      );
      return { ...actor, assuranceLevel: input.session.assuranceLevel };
    });
  }

  async inviteAdultUser(input: InviteAdultUserInput): Promise<AccountInvitation> {
    if (!input.adultEligibilityConfirmed) {
      throw new ValidationError("Adult eligibility must be explicitly confirmed.", "ADULT_ELIGIBILITY_REQUIRED");
    }

    const scope = await this.repository.transaction((transaction) =>
      transaction.findOrganizationResource(input.tenantId, input.scopeOrganizationId)
    );
    if (scope === null) {
      throw new NotFoundError("Invitation scope not found.");
    }
    assertRoleScope(input.roleCode, scope);
    assertScopedPolicy(input.actor, "invitation.create", scope, this.clock.now());

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
          requestId: input.requestId,
          auditActor: userAuditActor(input.actor)
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
        try {
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
              requestId: input.requestId,
              auditActor: userAuditActor(input.actor)
            })
          );
          return invitation;
        } catch (error) {
          await this.identityProvider.revokeInvitation(external.externalInvitationId);
          throw error;
        }
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
            requestId: input.requestId,
            auditActor: userAuditActor(input.actor)
          })
        );
      });
      throw error;
    }
  }

  async listInvitations(actor: ActorContext, tenantId: string): Promise<AccountInvitation[]> {
    const scopes = readableScopePaths(actor, tenantId, "invitation.read", this.clock.now());
    if (scopes.length === 0) {
      return [];
    }
    return this.repository.transaction((transaction) =>
      transaction.listInvitationsForScopes(tenantId, scopes)
    );
  }

  async revokeInvitation(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly invitationId: string;
    readonly requestId?: string;
  }): Promise<AccountInvitation> {
    const invitation = await this.repository.transaction(async (transaction) => {
      const target = await transaction.findInvitationForUpdate(input.invitationId);
      if (target === null || target.tenantId !== input.tenantId) {
        throw new NotFoundError("Invitation not found.");
      }
      const scope = await transaction.findOrganizationResource(input.tenantId, target.intendedScopeOrgId);
      if (scope === null) {
        throw new NotFoundError("Invitation scope not found.");
      }
      assertScopedPolicy(input.actor, "invitation.revoke", scope, this.clock.now());
      const revoked = await transaction.revokeInvitation({
        tenantId: input.tenantId,
        invitationId: input.invitationId,
        revokedByAccountId: input.actor.account.id
      });
      if (revoked === null) {
        throw new ConflictError("Invitation cannot be revoked from its current status.");
      }
      await transaction.appendAuditEvent(
        createIdentityAuditEvent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          resourceType: "invitation",
          resourceId: revoked.id,
          action: "identity.invitation_revoked",
          metadata: {},
          requestId: input.requestId,
          auditActor: userAuditActor(input.actor)
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
    const scopes = readableScopePaths(actor, tenantId, "role.read", this.clock.now());
    if (scopes.length === 0) {
      return [];
    }
    return this.repository.transaction((transaction) =>
      transaction.listRoleAssignmentsForScopes(tenantId, scopes)
    );
  }

  async listAccounts(actor: ActorContext, tenantId: string): Promise<AccountAdministrationView[]> {
    const scopes = readableScopePaths(actor, tenantId, "account.read", this.clock.now());
    if (scopes.length === 0) {
      return [];
    }
    return this.repository.transaction((transaction) =>
      transaction.listAccountsForScopes(tenantId, scopes)
    );
  }

  async revokeRoleAssignment(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly roleAssignmentId: string;
    readonly reason: string | null;
    readonly requestId?: string;
  }): Promise<RoleAssignment> {
    const assignment = await this.repository.transaction(async (transaction) => {
      const target = await transaction.findRoleAssignmentForUpdate(input.tenantId, input.roleAssignmentId);
      if (target === null) {
        throw new NotFoundError("Role assignment not found.");
      }
      const scope = await scopeForAssignment(transaction, target);
      assertScopedPolicy(input.actor, "role.revoke", scope, this.clock.now());
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
          requestId: input.requestId,
          auditActor: userAuditActor(input.actor)
        })
      );
      return revoked;
    });
    return assignment;
  }

  async createRoleAssignment(
    input: CreateRoleAssignmentUseCaseInput
  ): Promise<RoleAssignment> {
    return this.repository.transaction(async (transaction) => {
      if (input.scopeOrgId === null) {
        throw new ValidationError("Organization scope is required.", "SCOPE_REQUIRED");
      }
      const scope = await transaction.findOrganizationResource(input.tenantId, input.scopeOrgId);
      if (scope === null) {
        throw new NotFoundError("Role scope not found.");
      }
      const scopeType = assertRoleScope(input.roleCode, scope);
      assertScopedPolicy(input.actor, "role.assign", scope, this.clock.now());
      const assignment = await transaction.createRoleAssignment({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        accountId: input.accountId,
        roleCode: input.roleCode,
        scopeType,
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
          requestId: input.requestId,
          auditActor: userAuditActor(input.actor)
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
    const account = await this.repository.transaction(async (transaction) => {
      const targetView = await transaction.findAccountAdministrationViewForUpdate(input.accountId);
      if (targetView === null) {
        throw new NotFoundError("Account not found.");
      }
      const activeAssignments = targetView.assignments.filter((assignment) =>
        isRoleAssignmentActive(assignment, this.clock.now())
      );
      if (activeAssignments.length === 0) {
        throw new ValidationError("Account has no administrable active access.", "ACCOUNT_SCOPE_FORBIDDEN", 403);
      }
      for (const assignment of activeAssignments) {
        const scope = await scopeForAssignment(transaction, assignment);
        assertScopedPolicy(input.actor, "account.suspend", scope, this.clock.now());
      }
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
          requestId: input.requestId,
          auditActor: userAuditActor(input.actor)
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

function assertRoleScope(roleCode: RoleCode, scope: ScopedOrganizationResource): RoleScopeType {
  const result = validateSlice2RoleScope({
    roleCode,
    organizationType: scope.type
  });
  if (!("ok" in result)) {
    throw new ValidationError("Role cannot be granted on this scope in Slice 2.", result.reasonCode, 403);
  }
  return result.scopeType;
}

function assertScopedPolicy(
  actor: ActorContext,
  action: RoleAssignment["permissions"][number],
  scope: ScopedOrganizationResource,
  now: Date
): void {
  const decision = canAccessScopedAction(actor, action, toOrganizationResource(scope), { now });
  if (decision.effect === "deny") {
    throw new ValidationError("Permission denied.", decision.reasonCode, 403);
  }
}

function readableScopePaths(
  actor: ActorContext,
  tenantId: string,
  action: RoleAssignment["permissions"][number],
  now: Date
): string[] {
  const paths = new Set<string>();
  for (const assignment of actor.assignments) {
    // List endpoints must derive both permission and visible perimeter from the
    // same active assignment; combining a broad read-only scope with another
    // administrative permission would be a privilege escalation.
    if (
      assignment.tenantId === tenantId &&
      assignment.roleCode !== "PLATFORM_ADMIN" &&
      isRoleAssignmentActive(assignment, now) &&
      assignment.permissions.includes(action) &&
      assignment.scopePath !== null
    ) {
      paths.add(assignment.scopePath);
    }
  }
  return [...paths];
}

async function scopeForAssignment(
  transaction: IdentityTransaction,
  assignment: RoleAssignment
): Promise<ScopedOrganizationResource> {
  if (
    assignment.scopeOrgId === null ||
    assignment.scopePath === null ||
    assignment.scopeType === "GLOBAL_TECH" ||
    assignment.scopeType === "NATIONAL" ||
    assignment.scopeType === "OWN"
  ) {
    throw new ValidationError("Role assignment scope is not administrable in Slice 2.", "SCOPE_NOT_ADMINISTRABLE", 403);
  }
  const scope = await transaction.findOrganizationResource(assignment.tenantId, assignment.scopeOrgId);
  if (scope === null) {
    throw new NotFoundError("Role assignment scope not found.");
  }
  return scope;
}

function toOrganizationResource(scope: ScopedOrganizationResource): OrganizationResource {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    path: scope.path,
    type: scope.type
  };
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
  readonly auditActor?: { readonly kind: "SYSTEM" | "USER" | "SERVICE"; readonly id: string | null };
}) {
  return createAuditEvent(input);
}

export { displayNameFor };

function userAuditActor(actor: ActorContext): { readonly kind: "USER"; readonly id: string } {
  return { kind: "USER", id: actor.account.id };
}
