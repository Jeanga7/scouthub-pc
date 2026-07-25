import {
  getSlice2RoleScopeRule,
  isRoleAssignmentActive,
  type Account,
  type OrganizationType,
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
  readonly type?: OrganizationType;
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

export function canAccessScopedAction(
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
    if (assignment.roleCode === "PLATFORM_ADMIN") {
      continue;
    }
    if (!assignment.permissions.includes(action)) {
      continue;
    }
    if (isResourceInScope(assignment, resource)) {
      return allow("SAME_ASSIGNMENT_PERMISSION_SCOPE");
    }
  }

  return deny("NO_MATCHING_ACTIVE_ASSIGNMENT");
}

export function validateSlice2RoleScope(input: {
  readonly roleCode: RoleAssignment["roleCode"];
  readonly organizationType: OrganizationType;
}): { readonly ok: true; readonly scopeType: RoleAssignment["scopeType"] } | AuthorizationDecision {
  const rule = getSlice2RoleScopeRule(input.roleCode);
  if (rule === null) {
    return deny("ROLE_NOT_GRANTABLE_IN_SLICE_2");
  }
  if (rule.organizationType !== input.organizationType) {
    return deny("ROLE_SCOPE_ORG_TYPE_MISMATCH");
  }
  return { ok: true, scopeType: rule.scopeType };
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
