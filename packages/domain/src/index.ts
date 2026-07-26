export type EntityId = string;

export interface DomainEvent {
  readonly id: EntityId;
  readonly occurredAt: Date;
  readonly type: string;
}

export type { Organization, OrganizationMetadata } from "./organization/organization";
export {
  assertRootRules,
  normalizeOrganizationCode,
  normalizeOrganizationName,
  validateActivePeriod
} from "./organization/organization";
export {
  buildOrganizationPath,
  isAllowedParentChild,
  isDescendantPath,
  replacePathPrefix
} from "./organization/organization-hierarchy";
export { OrganizationDomainError } from "./organization/organization-errors";
export type { OrganizationStatus } from "./organization/organization-status";
export { organizationStatuses } from "./organization/organization-status";
export type { OrganizationType } from "./organization/organization-type";
export {
  isSlice1CreatableType,
  organizationTypes,
  slice1CreatableOrganizationTypes
} from "./organization/organization-type";
export type { Account, AccountStatus } from "./identity/account";
export { isActiveAccount } from "./identity/account";
export type {
  Person,
  PersonClassification,
  PersonStatus
} from "./identity/person";
export { displayNameFor } from "./identity/person";
export type {
  AccountInvitation,
  AccountInvitationStatus
} from "./identity/invitation";
export { canProvisionInvitation } from "./identity/invitation";
export type {
  PermissionCode,
  RoleAssignment,
  RoleCode,
  RoleScopeType,
  Slice2RoleScopeRule
} from "./authorization/role";
export {
  deriveSlice2ScopeType,
  getSlice2RoleScopeRule,
  isRoleAssignmentActive,
  isSlice2GrantableRole
} from "./authorization/role";
export type { Project } from "./project/project";
export {
  assertSlice3OwnerOrganization,
  buildInternalProjectSlug,
  buildProjectCode,
  normalizeOptionalProjectText,
  normalizeProjectTitle,
  validateProjectDateRange
} from "./project/project";
export { ProjectDomainError } from "./project/project-errors";
export type { ProjectMode } from "./project/project-mode";
export { projectModes } from "./project/project-mode";
export type { ProjectStatus } from "./project/project-status";
export { projectStatuses } from "./project/project-status";
export type { ProjectVisibility } from "./project/project-visibility";
export {
  isSlice3MutableProjectVisibility,
  projectVisibilities
} from "./project/project-visibility";
