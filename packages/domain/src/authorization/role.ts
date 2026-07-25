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
  | "audit.read";

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

