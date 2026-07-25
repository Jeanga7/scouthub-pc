import type {
  Account,
  AccountInvitation,
  Person,
  PermissionCode,
  RoleAssignment,
  RoleCode,
  RoleScopeType
} from "@scouthub/domain";
import type { AuditEventInput } from "../organization/audit";

export interface ActorContext {
  readonly account: Account;
  readonly person: Person | null;
  readonly assignments: readonly RoleAssignment[];
  readonly assuranceLevel: "standard" | "mfa";
}

export interface InviteAdultUserRecord {
  readonly tenantId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roleCode: RoleCode;
  readonly scopeOrganizationId: string;
  readonly invitedByAccountId: string;
  readonly expiresAt: Date;
  readonly adultEligibilityAttestedAt: Date;
  readonly ids: {
    readonly accountId: string;
    readonly personId: string;
    readonly invitationId: string;
  };
}

export interface CreatedInvitationDraft {
  readonly invitation: AccountInvitation;
  readonly roleId: string;
}

export interface BootstrapRegionalAdminInput {
  readonly tenantId: string;
  readonly regionOrganizationId: string;
  readonly subjectId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly ids: {
    readonly accountId: string;
    readonly personId: string;
    readonly roleAssignmentId: string;
  };
}

export interface CreateRoleAssignmentInput {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
  readonly roleCode: RoleCode;
  readonly scopeType: RoleScopeType;
  readonly scopeOrgId: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly grantedByAccountId: string;
}

export interface IdentityRepository {
  transaction<TResult>(
    handler: (transaction: IdentityTransaction) => Promise<TResult>
  ): Promise<TResult>;
}

export interface IdentityTransaction {
  findActorBySubject(subjectId: string): Promise<ActorContext | null>;
  findAccountById(accountId: string): Promise<Account | null>;
  findAccountBySubjectForUpdate(subjectId: string): Promise<Account | null>;
  findInvitationForUpdate(invitationId: string): Promise<AccountInvitation | null>;
  createInvitationDraft(input: InviteAdultUserRecord): Promise<CreatedInvitationDraft>;
  markInvitationPending(invitationId: string, externalInvitationId: string): Promise<AccountInvitation>;
  markInvitationFailed(invitationId: string): Promise<void>;
  acceptInvitation(input: {
    readonly invitationId: string;
    readonly subjectId: string;
    readonly emailVerifiedAt: Date;
    readonly roleAssignmentId: string;
  }): Promise<ActorContext>;
  listInvitations(tenantId: string): Promise<AccountInvitation[]>;
  revokeInvitation(input: {
    readonly tenantId: string;
    readonly invitationId: string;
    readonly revokedByAccountId: string;
  }): Promise<AccountInvitation | null>;
  listRoleAssignments(tenantId: string): Promise<RoleAssignment[]>;
  createRoleAssignment(input: CreateRoleAssignmentInput): Promise<RoleAssignment>;
  revokeRoleAssignment(input: {
    readonly tenantId: string;
    readonly roleAssignmentId: string;
    readonly revokedByAccountId: string;
    readonly reason: string | null;
  }): Promise<RoleAssignment | null>;
  suspendAccount(input: {
    readonly tenantId: string;
    readonly accountId: string;
  }): Promise<Account | null>;
  countActiveRegionalAdmins(tenantId: string, regionOrganizationId: string, now: Date): Promise<number>;
  bootstrapRegionalAdmin(input: BootstrapRegionalAdminInput): Promise<ActorContext>;
  findOrganizationResource(tenantId: string, organizationId: string): Promise<{
    readonly tenantId: string;
    readonly organizationId: string;
    readonly path: string;
  } | null>;
  getRolePermissions(roleCode: RoleCode): Promise<readonly PermissionCode[]>;
  appendAuditEvent(input: AuditEventInput): Promise<void>;
}

