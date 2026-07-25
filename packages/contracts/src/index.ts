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

const dateTimeOrNullSchema = z.iso.datetime().nullable().optional();

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
  name: z.string().min(1),
  code: z.string().min(1),
  locationLabel: z.string().min(1).nullable().optional(),
  activeFrom: dateTimeOrNullSchema,
  activeUntil: dateTimeOrNullSchema
});

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
