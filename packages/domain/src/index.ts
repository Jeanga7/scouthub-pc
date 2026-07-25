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
