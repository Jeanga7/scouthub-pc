import {
  isRoleAssignmentActive,
  type Account,
  type PermissionCode,
  type RoleAssignment
} from "@scouthub/domain";

export type AuthorizationEffect = "allow" | "deny";

export interface AuthorizationDecision {
  readonly effect: AuthorizationEffect;
  readonly reasonCode: string;
}

export interface Actor {
  readonly account: Account;
  readonly assignments: readonly RoleAssignment[];
  readonly assuranceLevel: "standard" | "mfa";
}

export interface OrganizationResource {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly path: string;
}

export interface PolicyContext {
  readonly now: Date;
}

export const allow = (reasonCode = "ALLOW"): AuthorizationDecision => ({
  effect: "allow",
  reasonCode
});

export const deny = (reasonCode = "DENY"): AuthorizationDecision => ({
  effect: "deny",
  reasonCode
});

export function canAccessOrganization(
  actor: Actor,
  action: PermissionCode,
  resource: OrganizationResource,
  context: PolicyContext
): AuthorizationDecision {
  if (actor.account.status !== "ACTIVE") {
    return deny(actor.account.status === "SUSPENDED" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_NOT_ACTIVE");
  }

  for (const assignment of actor.assignments) {
    if (!isRoleAssignmentActive(assignment, context.now)) {
      continue;
    }
    if (assignment.tenantId !== resource.tenantId) {
      continue;
    }
    if (!assignment.permissions.includes(action)) {
      continue;
    }
    if (assignment.roleCode === "PLATFORM_ADMIN" && action.startsWith("organization.")) {
      return deny("PLATFORM_ADMIN_NO_BUSINESS_DATA");
    }
    if (isResourceInScope(assignment, resource)) {
      return allow("ROLE_SCOPE_MATCH");
    }
  }

  return deny("NO_MATCHING_ACTIVE_ASSIGNMENT");
}

export function canPerformTenantAction(
  actor: Actor,
  action: PermissionCode,
  tenantId: string,
  context: PolicyContext
): AuthorizationDecision {
  if (actor.account.status !== "ACTIVE") {
    return deny(actor.account.status === "SUSPENDED" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_NOT_ACTIVE");
  }

  const matched = actor.assignments.some(
    (assignment) =>
      isRoleAssignmentActive(assignment, context.now) &&
      assignment.tenantId === tenantId &&
      assignment.permissions.includes(action) &&
      assignment.roleCode !== "PLATFORM_ADMIN"
  );

  return matched ? allow("TENANT_PERMISSION") : deny("NO_TENANT_PERMISSION");
}

function isResourceInScope(
  assignment: RoleAssignment,
  resource: OrganizationResource
): boolean {
  if (assignment.scopeType === "GLOBAL_TECH" || assignment.scopePath === null) {
    return false;
  }
  if (assignment.scopeOrgId === resource.organizationId) {
    return true;
  }

  // Slice 1 paths always end in "/" and contain UUID segments, so prefix matching
  // cannot confuse sibling UUIDs such as /abc/ and /abcd/.
  return resource.path.startsWith(assignment.scopePath);
}
