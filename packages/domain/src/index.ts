export type EntityId = string;

export type {
  CreateDomainEventInput,
  DomainEvent,
  EventPayload,
  JsonValue
} from "./events/domain-event";
export {
  createDomainEvent,
  normalizeAggregateType,
  normalizeEventType,
  serializeEventPayload
} from "./events/domain-event";
export { EventDomainError } from "./events/event-errors";
export type {
  ProjectSubmittedForReviewEvent,
  ProjectSubmittedForReviewPayload
} from "./events/project-events";
export {
  createProjectSubmittedForReviewEvent,
  projectAggregateType,
  projectSubmittedForReviewEventType
} from "./events/project-events";
export type { OutboxEventStatus } from "./events/outbox-event-status";
export { canTransitionOutboxStatus, outboxEventStatuses } from "./events/outbox-event-status";

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
export type {
  ApprovalDecision,
  ApprovalRequestStatus,
  ApprovalResourceType,
  ApprovalStage,
  ApprovalWorkflow,
  ProjectCommentFieldKey,
  ProjectCommentKind,
  Slice4ProjectTransition
} from "./project/project-workflow";
export {
  assertProjectCommentShape,
  assertSlice4Transition,
  isProjectContentEditable,
  normalizeReviewText,
  projectCommentFieldKeys,
  slice4EditableProjectStatuses,
  slice4ProjectTransitions
} from "./project/project-workflow";
export type {
  EvidenceClassification,
  EvidenceMime,
  EvidenceRejectionCode,
  EvidenceScanStatus,
  EvidenceType,
  EvidenceUploadStatus,
  EvidenceValidationStatus,
  EvidenceVisibility
} from "./evidence/evidence";
export {
  assertEvidenceByteSize,
  assertEvidenceClassification,
  assertEvidenceExtension,
  assertEvidenceMagicBytes,
  assertEvidenceMime,
  assertEvidenceMimeMatchesType,
  assertEvidenceSha256Hex,
  assertEvidenceVisibility,
  assertSlice5EvidenceType,
  assertUploadableProjectStatus,
  evidenceDownloadUrlTtlSeconds,
  EvidenceDomainError,
  evidenceMaxImageBytes,
  evidenceMaxPdfBytes,
  evidenceUploadUrlTtlSeconds,
  normalizeEvidenceDescription,
  normalizeEvidenceTitle
} from "./evidence/evidence";
