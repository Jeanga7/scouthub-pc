export type RoleCode =
  | "PROJECT_CONTRIBUTOR"
  | "UNIT_LEADER"
  | "GROUP_ADMIN"
  | "DISTRICT_REVIEWER"
  | "REGIONAL_PROGRAMME_REVIEWER"
  | "REGIONAL_ADMIN"
  | "REGIONAL_COMMS"
  | "DATA_OFFICER"
  | "NATIONAL_OBSERVER"
  | "PLATFORM_ADMIN";

export type PermissionCode =
  | "organization.read"
  | "organization.create"
  | "organization.update"
  | "organization.activate"
  | "organization.move"
  | "invitation.create"
  | "invitation.read"
  | "invitation.revoke"
  | "role.read"
  | "role.assign"
  | "role.revoke"
  | "account.read"
  | "account.suspend"
  | "audit.read"
  | "project.create"
  | "project.read"
  | "project.update"
  | "project.submit"
  | "project.comment"
  | "project.review"
  | "project.request_changes"
  | "project.approve"
  | "project.reject"
  | "evidence.create"
  | "evidence.read"
  | "evidence.download";

export type RoleScopeType =
  | "OWN"
  | "UNIT"
  | "GROUP"
  | "DISTRICT"
  | "REGION"
  | "NATIONAL"
  | "GLOBAL_TECH";

export interface RoleAssignment {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
  readonly roleId: string;
  readonly roleCode: RoleCode;
  readonly permissions: readonly PermissionCode[];
  readonly scopeType: RoleScopeType;
  readonly scopeOrgId: string | null;
  readonly scopePath: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly grantedByAccountId: string | null;
  readonly grantedAt: Date;
  readonly revokedAt: Date | null;
}

export function isRoleAssignmentActive(
  assignment: RoleAssignment,
  now: Date
): boolean {
  return (
    assignment.startsAt <= now &&
    (assignment.endsAt === null || now < assignment.endsAt) &&
    assignment.revokedAt === null
  );
}

export interface Slice2RoleScopeRule {
  readonly roleCode: RoleCode;
  readonly scopeType: RoleScopeType;
  readonly organizationType: OrganizationType;
  readonly grantableByRegionalAdmin: boolean;
}

const slice2RoleScopeRules = [
  {
    roleCode: "UNIT_LEADER",
    scopeType: "UNIT",
    organizationType: "UNIT",
    grantableByRegionalAdmin: true
  },
  {
    roleCode: "GROUP_ADMIN",
    scopeType: "GROUP",
    organizationType: "GROUP",
    grantableByRegionalAdmin: true
  },
  {
    roleCode: "DISTRICT_REVIEWER",
    scopeType: "DISTRICT",
    organizationType: "DISTRICT",
    grantableByRegionalAdmin: true
  },
  {
    roleCode: "REGIONAL_PROGRAMME_REVIEWER",
    scopeType: "REGION",
    organizationType: "REGION",
    grantableByRegionalAdmin: true
  },
  {
    roleCode: "REGIONAL_ADMIN",
    scopeType: "REGION",
    organizationType: "REGION",
    grantableByRegionalAdmin: true
  },
  {
    roleCode: "REGIONAL_COMMS",
    scopeType: "REGION",
    organizationType: "REGION",
    grantableByRegionalAdmin: true
  },
  {
    roleCode: "DATA_OFFICER",
    scopeType: "REGION",
    organizationType: "REGION",
    grantableByRegionalAdmin: true
  }
] as const satisfies readonly Slice2RoleScopeRule[];

export function getSlice2RoleScopeRule(
  roleCode: RoleCode
): Slice2RoleScopeRule | null {
  return (
    slice2RoleScopeRules.find((rule) => rule.roleCode === roleCode) ?? null
  );
}

export function deriveSlice2ScopeType(roleCode: RoleCode): RoleScopeType | null {
  return getSlice2RoleScopeRule(roleCode)?.scopeType ?? null;
}

export function isSlice2GrantableRole(roleCode: RoleCode): boolean {
  return getSlice2RoleScopeRule(roleCode)?.grantableByRegionalAdmin ?? false;
}
import type { OrganizationType } from "../organization/organization-type";
