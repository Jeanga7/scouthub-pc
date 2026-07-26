import { appEnvironmentSchema } from "@scouthub/config";
import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("scouthub-web"),
  environment: appEnvironmentSchema,
  timestamp: z.iso.datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const organizationTypeSchema = z.enum([
  "NSO",
  "REGION",
  "DISTRICT",
  "GROUP",
  "UNIT",
  "TEAM"
]);

export const organizationStatusSchema = z.enum(["DRAFT", "ACTIVE"]);

export const uuidSchema = z.uuid();
export const roleCodeSchema = z.enum([
  "PROJECT_CONTRIBUTOR",
  "UNIT_LEADER",
  "GROUP_ADMIN",
  "DISTRICT_REVIEWER",
  "REGIONAL_PROGRAMME_REVIEWER",
  "REGIONAL_ADMIN",
  "REGIONAL_COMMS",
  "DATA_OFFICER",
  "NATIONAL_OBSERVER",
  "PLATFORM_ADMIN"
]);
export const roleScopeTypeSchema = z.enum([
  "OWN",
  "UNIT",
  "GROUP",
  "DISTRICT",
  "REGION",
  "NATIONAL",
  "GLOBAL_TECH"
]);
export const permissionCodeSchema = z.enum([
  "organization.read",
  "organization.create",
  "organization.update",
  "organization.activate",
  "organization.move",
  "invitation.create",
  "invitation.read",
  "invitation.revoke",
  "role.read",
  "role.assign",
  "role.revoke",
  "account.read",
  "account.suspend",
  "audit.read",
  "project.create",
  "project.read",
  "project.update"
]);

const dateTimeOrNullSchema = z.iso.datetime().nullable().optional();
const dateTimePatchSchema = z.iso.datetime().nullable().optional();
const organizationPatchMutableFields = [
  "name",
  "code",
  "locationLabel",
  "activeFrom",
  "activeUntil"
] as const;

export const organizationResponseSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  parentId: uuidSchema.nullable(),
  type: organizationTypeSchema,
  name: z.string(),
  code: z.string(),
  status: organizationStatusSchema,
  path: z.string(),
  depth: z.number().int().nonnegative(),
  locationLabel: z.string().nullable(),
  activeFrom: z.iso.datetime().nullable(),
  activeUntil: z.iso.datetime().nullable(),
  metadata: z.record(z.string(), z.never()),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export const organizationListResponseSchema = z.object({
  data: z.array(organizationResponseSchema),
  request_id: z.string()
});

export const singleOrganizationResponseSchema = z.object({
  data: organizationResponseSchema,
  request_id: z.string()
});

export const createTenantRootRequestSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  locationLabel: z.string().min(1).nullable().optional(),
  activeFrom: dateTimeOrNullSchema,
  activeUntil: dateTimeOrNullSchema
});

export const createOrganizationRequestSchema = z.object({
  tenantId: uuidSchema,
  parentId: uuidSchema,
  type: organizationTypeSchema,
  name: z.string().min(1),
  code: z.string().min(1),
  locationLabel: z.string().min(1).nullable().optional(),
  activeFrom: dateTimeOrNullSchema,
  activeUntil: dateTimeOrNullSchema
});

export const updateOrganizationRequestSchema = z.object({
  tenantId: uuidSchema,
  expectedVersion: z.number().int().positive(),
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  locationLabel: z.string().min(1).nullable().optional(),
  activeFrom: dateTimePatchSchema,
  activeUntil: dateTimePatchSchema
}).strict().refine(
  (payload) => organizationPatchMutableFields.some((field) => field in payload),
  { message: "At least one mutable organization field is required." }
);

export const versionedOrganizationRequestSchema = z.object({
  tenantId: uuidSchema,
  expectedVersion: z.number().int().positive()
});

export const moveOrganizationRequestSchema = versionedOrganizationRequestSchema.extend({
  newParentId: uuidSchema
});

export const tenantQuerySchema = z.object({
  tenantId: uuidSchema
});

export const meResponseSchema = z.object({
  account: z.object({
    id: uuidSchema,
    primaryEmail: z.string(),
    status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DISABLED", "ANONYMIZED"])
  }),
  person: z.object({
    id: uuidSchema,
    tenantId: uuidSchema,
    displayName: z.string(),
    classification: z.literal("P2")
  }).nullable(),
  roleAssignments: z.array(z.object({
    id: uuidSchema,
    tenantId: uuidSchema,
    roleCode: roleCodeSchema,
    permissions: z.array(permissionCodeSchema),
    scopeType: roleScopeTypeSchema,
    scopeOrgId: uuidSchema.nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable()
  })),
  scopes: z.array(z.object({
    tenantId: uuidSchema,
    scopeOrgId: uuidSchema.nullable(),
    scopeType: roleScopeTypeSchema
  }))
});

export const inviteAdultUserRequestSchema = z.object({
  tenantId: uuidSchema,
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  roleCode: roleCodeSchema,
  scopeOrganizationId: uuidSchema,
  adultEligibilityConfirmed: z.literal(true)
}).strict();

export const invitationResponseSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  email: z.string(),
  intendedRoleCode: roleCodeSchema,
  intendedScopeOrgId: uuidSchema,
  status: z.enum(["CREATING", "PENDING", "ACCEPTED", "REVOKED", "EXPIRED", "FAILED"]),
  expiresAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime()
});

export const createRoleAssignmentRequestSchema = z.object({
  tenantId: uuidSchema,
  accountId: uuidSchema,
  roleCode: roleCodeSchema,
  scopeOrgId: uuidSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional()
}).strict();

export const roleAssignmentResponseSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  accountId: uuidSchema,
  roleCode: roleCodeSchema,
  permissions: z.array(permissionCodeSchema),
  scopeType: roleScopeTypeSchema,
  scopeOrgId: uuidSchema.nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable()
});

export const accountAdministrationResponseSchema = z.object({
  account: z.object({
    id: uuidSchema,
    primaryEmail: z.string(),
    status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DISABLED", "ANONYMIZED"])
  }),
  person: z.object({
    id: uuidSchema,
    tenantId: uuidSchema,
    displayName: z.string(),
    classification: z.literal("P2")
  }).nullable(),
  activeRoleAssignments: z.array(roleAssignmentResponseSchema)
});

export const revokeRoleAssignmentRequestSchema = z.object({
  tenantId: uuidSchema,
  reason: z.string().min(1).nullable().optional()
}).strict();

export const revokeInvitationRequestSchema = z.object({
  tenantId: uuidSchema
}).strict();

export const suspendAccountRequestSchema = z.object({
  tenantId: uuidSchema
}).strict();

export const projectModeSchema = z.enum(["PLANNED", "ALREADY_COMPLETED"]);
export const projectStatusSchema = z.enum([
  "DRAFT",
  "READY_FOR_REVIEW",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED_FOR_EXECUTION",
  "IN_EXECUTION",
  "EXECUTION_COMPLETED",
  "FINAL_REVIEW",
  "FINAL_CHANGES_REQUESTED",
  "VALIDATED",
  "READY_FOR_PUBLICATION",
  "PUBLISHED",
  "EXTERNAL_SUBMITTED",
  "MONITORING",
  "CLOSED",
  "CANCELLED",
  "REJECTED",
  "ARCHIVED"
]);
export const projectVisibilitySchema = z.enum([
  "PRIVATE",
  "INTERNAL",
  "REVIEW_PUBLIC",
  "PUBLIC",
  "UNPUBLISHED",
  "ARCHIVED"
]);
export const slice3ProjectVisibilitySchema = z.enum(["PRIVATE", "INTERNAL"]);
const projectPatchMutableFields = [
  "title",
  "summary",
  "problemStatement",
  "diagnostic",
  "projectMode",
  "visibility",
  "locationLabel",
  "plannedStartAt",
  "plannedEndAt",
  "actualStartAt",
  "actualEndAt"
] as const;

export const createProjectDraftRequestSchema = z.object({
  tenantId: uuidSchema,
  ownerOrganizationId: uuidSchema,
  title: z.string().min(1),
  projectMode: projectModeSchema.optional(),
  visibility: slice3ProjectVisibilitySchema.optional(),
  summary: z.string().nullable().optional(),
  problemStatement: z.string().nullable().optional(),
  diagnostic: z.string().nullable().optional(),
  locationLabel: z.string().nullable().optional(),
  plannedStartAt: dateTimePatchSchema,
  plannedEndAt: dateTimePatchSchema,
  actualStartAt: dateTimePatchSchema,
  actualEndAt: dateTimePatchSchema
}).strict();

export const updateProjectDraftRequestSchema = z.object({
  tenantId: uuidSchema,
  expectedVersion: z.number().int().positive(),
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  problemStatement: z.string().nullable().optional(),
  diagnostic: z.string().nullable().optional(),
  projectMode: projectModeSchema.optional(),
  visibility: slice3ProjectVisibilitySchema.optional(),
  locationLabel: z.string().nullable().optional(),
  plannedStartAt: dateTimePatchSchema,
  plannedEndAt: dateTimePatchSchema,
  actualStartAt: dateTimePatchSchema,
  actualEndAt: dateTimePatchSchema
}).strict().refine(
  (payload) => projectPatchMutableFields.some((field) => field in payload),
  { message: "At least one mutable project field is required." }
);

export const listProjectsQuerySchema = z.object({
  tenantId: uuidSchema,
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  ownerOrganizationId: uuidSchema.optional(),
  projectMode: projectModeSchema.optional(),
  status: z.literal("DRAFT").optional()
});

export const projectResponseSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  ownerOrganization: z.object({
    id: uuidSchema,
    name: z.string(),
    type: organizationTypeSchema
  }),
  code: z.string(),
  internalSlug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  problemStatement: z.string().nullable(),
  diagnostic: z.string().nullable(),
  projectMode: projectModeSchema,
  status: projectStatusSchema,
  visibility: projectVisibilitySchema,
  locationLabel: z.string().nullable(),
  plannedStartAt: z.iso.datetime().nullable(),
  plannedEndAt: z.iso.datetime().nullable(),
  actualStartAt: z.iso.datetime().nullable(),
  actualEndAt: z.iso.datetime().nullable(),
  projectLead: z.object({
    id: uuidSchema,
    displayName: z.string()
  }),
  capabilities: z.object({
    canUpdate: z.boolean()
  }).optional(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export const projectListResponseSchema = z.object({
  projects: z.array(projectResponseSchema),
  nextCursor: z.string().nullable()
});

export const projectOwnerOptionSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: z.enum(["GROUP", "UNIT"]),
  path: z.string()
});

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  request_id: z.string()
});

export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;
export type CreateTenantRootRequest = z.infer<typeof createTenantRootRequestSchema>;
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;
export type MoveOrganizationRequest = z.infer<typeof moveOrganizationRequestSchema>;
export type InviteAdultUserRequest = z.infer<typeof inviteAdultUserRequestSchema>;
export type InvitationResponse = z.infer<typeof invitationResponseSchema>;
export type CreateRoleAssignmentRequest = z.infer<typeof createRoleAssignmentRequestSchema>;
export type RoleAssignmentResponse = z.infer<typeof roleAssignmentResponseSchema>;
export type AccountAdministrationResponse = z.infer<typeof accountAdministrationResponseSchema>;
export type RevokeRoleAssignmentRequest = z.infer<typeof revokeRoleAssignmentRequestSchema>;
export type RevokeInvitationRequest = z.infer<typeof revokeInvitationRequestSchema>;
export type SuspendAccountRequest = z.infer<typeof suspendAccountRequestSchema>;
export type CreateProjectDraftRequest = z.infer<typeof createProjectDraftRequestSchema>;
export type UpdateProjectDraftRequest = z.infer<typeof updateProjectDraftRequestSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type ProjectOwnerOption = z.infer<typeof projectOwnerOptionSchema>;
