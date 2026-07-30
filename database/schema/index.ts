import {
  check,
  bigint,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "dispatched",
  "failed"
]);

export const outboxEvent = pgTable(
  "outbox_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true })
  },
  (table) => [
    index("outbox_event_status_created_at_idx").on(
      table.status,
      table.createdAt
    )
  ]
);

export const organizationType = pgEnum("organization_type", [
  "NSO",
  "REGION",
  "DISTRICT",
  "GROUP",
  "UNIT",
  "TEAM"
]);

export const organizationStatus = pgEnum("organization_status", [
  "DRAFT",
  "ACTIVE"
]);

export const organization = pgTable(
  "organization",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    parentId: uuid("parent_id"),
    type: organizationType("type").notNull(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    status: organizationStatus("status").notNull().default("DRAFT"),
    path: text("path").notNull(),
    depth: integer("depth").notNull().default(0),
    locationLabel: text("location_label"),
    activeFrom: timestamp("active_from", { withTimezone: true }),
    activeUntil: timestamp("active_until", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique("organization_id_tenant_id_unique").on(table.id, table.tenantId),
    unique("organization_tenant_code_unique").on(table.tenantId, table.code),
    foreignKey({
      columns: [table.parentId, table.tenantId],
      foreignColumns: [table.id, table.tenantId],
      name: "organization_parent_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("organization_tenant_idx").on(table.tenantId),
    index("organization_parent_idx").on(table.tenantId, table.parentId),
    index("organization_path_idx").on(
      table.tenantId,
      table.path.op("text_pattern_ops")
    ),
    index("organization_type_idx").on(table.tenantId, table.type),
    index("organization_status_idx").on(table.tenantId, table.status),
    check("organization_depth_non_negative", sql`${table.depth} >= 0`),
    check("organization_version_positive", sql`${table.version} >= 1`),
    check("organization_name_not_empty", sql`length(btrim(${table.name})) > 0`),
    check("organization_code_not_empty", sql`length(btrim(${table.code})) > 0`),
    check(
      "organization_active_period_valid",
      sql`${table.activeUntil} IS NULL OR ${table.activeFrom} IS NULL OR ${table.activeUntil} >= ${table.activeFrom}`
    ),
    check(
      "organization_root_parent_valid",
      sql`(${table.type} = 'NSO' AND ${table.parentId} IS NULL AND ${table.id} = ${table.tenantId} AND ${table.depth} = 0) OR (${table.type} <> 'NSO' AND ${table.parentId} IS NOT NULL)`
    ),
    check(
      "organization_parent_not_self",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`
    )
  ]
);

export const auditActorKind = pgEnum("audit_actor_kind", [
  "SYSTEM",
  "USER",
  "SERVICE"
]);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    action: text("action").notNull(),
    actorKind: auditActorKind("actor_kind").notNull(),
    actorId: uuid("actor_id"),
    requestId: text("request_id"),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index("audit_event_tenant_resource_idx").on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
      table.occurredAt
    ),
    index("audit_event_tenant_action_idx").on(table.tenantId, table.action)
  ]
);

export const accountStatus = pgEnum("account_status", [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "DISABLED",
  "ANONYMIZED"
]);

export const personClassification = pgEnum("person_classification", ["P2"]);

export const personStatus = pgEnum("person_status", [
  "ACTIVE",
  "INACTIVE",
  "ANONYMIZED"
]);

export const accountInvitationStatus = pgEnum("account_invitation_status", [
  "CREATING",
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
  "FAILED"
]);

export const roleScopeType = pgEnum("role_scope_type", [
  "OWN",
  "UNIT",
  "GROUP",
  "DISTRICT",
  "REGION",
  "NATIONAL",
  "GLOBAL_TECH"
]);

export const projectMode = pgEnum("project_mode", [
  "PLANNED",
  "ALREADY_COMPLETED"
]);

export const projectStatus = pgEnum("project_status", [
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

export const projectVisibility = pgEnum("project_visibility", [
  "PRIVATE",
  "INTERNAL",
  "REVIEW_PUBLIC",
  "PUBLIC",
  "UNPUBLISHED",
  "ARCHIVED"
]);

export const approvalRequestStatus = pgEnum("approval_request_status", [
  "PENDING",
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED",
  "CANCELLED"
]);

export const approvalDecision = pgEnum("approval_decision_type", [
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED"
]);

export const projectCommentKind = pgEnum("project_comment_kind", [
  "GLOBAL",
  "FIELD"
]);

export const evidenceClassification = pgEnum("evidence_classification", [
  "P1",
  "P2",
  "P3"
]);

export const mediaUploadStatus = pgEnum("media_upload_status", [
  "PENDING_UPLOAD",
  "VERIFYING",
  "VERIFIED",
  "REJECTED"
]);

export const mediaScanStatus = pgEnum("media_scan_status", [
  "NOT_SCANNED"
]);

export const evidenceType = pgEnum("evidence_type", [
  "PHOTO",
  "VIDEO_LINK",
  "DOCUMENT",
  "ATTESTATION",
  "ATTENDANCE_LIST",
  "MEASUREMENT",
  "LOCATION",
  "TESTIMONIAL",
  "YOUTH_OUTPUT",
  "RECEIPT",
  "EXTERNAL_CAPTURE"
]);

export const evidenceVisibility = pgEnum("evidence_visibility", [
  "PRIVATE",
  "INTERNAL"
]);

export const evidenceValidationStatus = pgEnum("evidence_validation_status", [
  "UNREVIEWED",
  "VALIDATED",
  "REJECTED"
]);

export const account = pgTable(
  "account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalIdentityId: text("external_identity_id"),
    primaryEmail: text("primary_email").notNull(),
    status: accountStatus("status").notNull().default("INVITED"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex("account_external_identity_unique")
      .on(table.externalIdentityId)
      .where(sql`${table.externalIdentityId} IS NOT NULL`),
    index("account_primary_email_idx").on(table.primaryEmail),
    index("account_status_idx").on(table.status),
    check("account_primary_email_not_empty", sql`length(btrim(${table.primaryEmail})) > 0`)
  ]
);

export const person = pgTable(
  "person",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    displayName: text("display_name").notNull(),
    birthDate: timestamp("birth_date", { withTimezone: true }),
    classification: personClassification("classification").notNull().default("P2"),
    status: personStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    unique("person_id_tenant_unique").on(table.id, table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: "person_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("person_tenant_idx").on(table.tenantId),
    check("person_first_name_not_empty", sql`length(btrim(${table.firstName})) > 0`),
    check("person_last_name_not_empty", sql`length(btrim(${table.lastName})) > 0`),
    check("person_display_name_not_empty", sql`length(btrim(${table.displayName})) > 0`)
  ]
);

export const accountPersonLink = pgTable(
  "account_person_link",
  {
    accountId: uuid("account_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    personId: uuid("person_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.tenantId] }),
    unique("account_person_link_person_unique").on(table.personId),
    unique("account_person_link_account_tenant_person_unique").on(
      table.accountId,
      table.tenantId,
      table.personId
    ),
    foreignKey({
      columns: [table.accountId],
      foreignColumns: [account.id],
      name: "account_person_link_account_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.personId],
      foreignColumns: [person.id],
      name: "account_person_link_person_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.personId, table.tenantId],
      foreignColumns: [person.id, person.tenantId],
      name: "account_person_link_person_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: "account_person_link_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict")
  ]
);

export const roleDefinition = pgTable(
  "role_definition",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: integer("is_system").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    unique("role_definition_code_unique").on(table.code),
    check("role_definition_code_not_empty", sql`length(btrim(${table.code})) > 0`)
  ]
);

export const permissionDefinition = pgTable(
  "permission_definition",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    unique("permission_definition_code_unique").on(table.code),
    check("permission_definition_code_not_empty", sql`length(btrim(${table.code})) > 0`)
  ]
);

export const rolePermission = pgTable(
  "role_permission",
  {
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roleDefinition.id],
      name: "role_permission_role_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissionDefinition.id],
      name: "role_permission_permission_fk"
    }).onDelete("restrict").onUpdate("restrict")
  ]
);

export const roleAssignment = pgTable(
  "role_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    accountId: uuid("account_id").notNull(),
    roleId: uuid("role_id").notNull(),
    scopeType: roleScopeType("scope_type").notNull(),
    scopeOrgId: uuid("scope_org_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    grantedByAccountId: uuid("granted_by_account_id"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByAccountId: uuid("revoked_by_account_id"),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: "role_assignment_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.accountId],
      foreignColumns: [account.id],
      name: "role_assignment_account_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.accountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "role_assignment_account_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roleDefinition.id],
      name: "role_assignment_role_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.scopeOrgId, table.tenantId],
      foreignColumns: [organization.id, organization.tenantId],
      name: "role_assignment_scope_org_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.grantedByAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "role_assignment_granted_by_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.revokedByAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "role_assignment_revoked_by_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("role_assignment_account_idx").on(table.accountId),
    index("role_assignment_tenant_scope_idx").on(table.tenantId, table.scopeOrgId),
    index("role_assignment_active_idx").on(
      table.tenantId,
      table.accountId,
      table.startsAt,
      table.endsAt,
      table.revokedAt
    ),
    check(
      "role_assignment_dates_valid",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} < ${table.endsAt}`
    ),
    check(
      "role_assignment_scope_org_required",
      sql`(${table.scopeType} = 'GLOBAL_TECH' AND ${table.scopeOrgId} IS NULL) OR (${table.scopeType} <> 'GLOBAL_TECH' AND ${table.scopeOrgId} IS NOT NULL)`
    )
  ]
);

export const accountInvitation = pgTable(
  "account_invitation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    accountId: uuid("account_id").notNull(),
    personId: uuid("person_id").notNull(),
    email: text("email").notNull(),
    intendedRoleId: uuid("intended_role_id").notNull(),
    intendedScopeOrgId: uuid("intended_scope_org_id").notNull(),
    status: accountInvitationStatus("status").notNull().default("CREATING"),
    externalInvitationId: text("external_invitation_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    invitedByAccountId: uuid("invited_by_account_id").notNull(),
    adultEligibilityAttestedAt: timestamp("adult_eligibility_attested_at", {
      withTimezone: true
    }).notNull(),
    adultEligibilityAttestedBy: uuid("adult_eligibility_attested_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: "account_invitation_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.accountId],
      foreignColumns: [account.id],
      name: "account_invitation_account_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.accountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "account_invitation_account_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.accountId, table.tenantId, table.personId],
      foreignColumns: [
        accountPersonLink.accountId,
        accountPersonLink.tenantId,
        accountPersonLink.personId
      ],
      name: "account_invitation_account_person_link_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.personId],
      foreignColumns: [person.id],
      name: "account_invitation_person_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.personId, table.tenantId],
      foreignColumns: [person.id, person.tenantId],
      name: "account_invitation_person_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.intendedRoleId],
      foreignColumns: [roleDefinition.id],
      name: "account_invitation_intended_role_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.intendedScopeOrgId, table.tenantId],
      foreignColumns: [organization.id, organization.tenantId],
      name: "account_invitation_scope_org_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.invitedByAccountId],
      foreignColumns: [account.id],
      name: "account_invitation_invited_by_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.invitedByAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "account_invitation_invited_by_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.adultEligibilityAttestedBy, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "account_invitation_adult_attested_by_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    uniqueIndex("account_invitation_external_unique")
      .on(table.externalInvitationId)
      .where(sql`${table.externalInvitationId} IS NOT NULL`),
    index("account_invitation_tenant_status_idx").on(table.tenantId, table.status),
    index("account_invitation_email_idx").on(table.email),
    check("account_invitation_email_not_empty", sql`length(btrim(${table.email})) > 0`)
  ]
);

export const project = pgTable(
  "project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    ownerOrgId: uuid("owner_org_id").notNull(),
    code: text("code").notNull(),
    internalSlug: text("internal_slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    problemStatement: text("problem_statement"),
    diagnostic: text("diagnostic"),
    projectMode: projectMode("project_mode").notNull().default("PLANNED"),
    status: projectStatus("status").notNull().default("DRAFT"),
    visibility: projectVisibility("visibility").notNull().default("PRIVATE"),
    locationLabel: text("location_label"),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
    projectLeadPersonId: uuid("project_lead_person_id").notNull(),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    unique("project_id_tenant_unique").on(table.id, table.tenantId),
    unique("project_tenant_code_unique").on(table.tenantId, table.code),
    unique("project_tenant_internal_slug_unique").on(table.tenantId, table.internalSlug),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: "project_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.ownerOrgId, table.tenantId],
      foreignColumns: [organization.id, organization.tenantId],
      name: "project_owner_org_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.projectLeadPersonId, table.tenantId],
      foreignColumns: [person.id, person.tenantId],
      name: "project_lead_person_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.createdByAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "project_created_by_account_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("project_tenant_idx").on(table.tenantId),
    index("project_owner_org_idx").on(table.tenantId, table.ownerOrgId),
    index("project_status_idx").on(table.tenantId, table.status),
    index("project_mode_idx").on(table.tenantId, table.projectMode),
    index("project_updated_at_idx").on(table.tenantId, table.updatedAt, table.id),
    check("project_version_positive", sql`${table.version} >= 1`),
    check("project_title_not_empty", sql`length(btrim(${table.title})) > 0`),
    check(
      "project_planned_dates_valid",
      sql`${table.plannedEndAt} IS NULL OR ${table.plannedStartAt} IS NULL OR ${table.plannedEndAt} >= ${table.plannedStartAt}`
    ),
    check(
      "project_actual_dates_valid",
      sql`${table.actualEndAt} IS NULL OR ${table.actualStartAt} IS NULL OR ${table.actualEndAt} >= ${table.actualStartAt}`
    )
  ]
);

export const approvalRequest = pgTable(
  "approval_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    resourceType: text("resource_type").notNull().default("PROJECT"),
    resourceId: uuid("resource_id").notNull(),
    workflow: text("workflow").notNull().default("PROJECT"),
    stage: text("stage").notNull().default("INITIAL_REVIEW"),
    status: approvalRequestStatus("status").notNull().default("PENDING"),
    submittedProjectVersion: integer("submitted_project_version").notNull(),
    requestedByAccountId: uuid("requested_by_account_id").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("approval_request_project_tenant_unique").on(table.id, table.resourceId, table.tenantId),
    unique("approval_request_id_tenant_unique").on(table.id, table.tenantId),
    uniqueIndex("approval_request_one_pending_project_stage_unique")
      .on(table.tenantId, table.resourceId, table.workflow, table.stage)
      .where(sql`${table.status} = 'PENDING'`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organization.id],
      name: "approval_request_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.resourceId, table.tenantId],
      foreignColumns: [project.id, project.tenantId],
      name: "approval_request_project_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.requestedByAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "approval_request_requested_by_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("approval_request_queue_idx").on(table.tenantId, table.status, table.requestedAt, table.id),
    check("approval_request_submitted_version_positive", sql`${table.submittedProjectVersion} >= 1`),
    check("approval_request_project_only", sql`${table.resourceType} = 'PROJECT' AND ${table.workflow} = 'PROJECT' AND ${table.stage} = 'INITIAL_REVIEW'`),
    check("approval_request_resolved_when_terminal", sql`(${table.status} = 'PENDING' AND ${table.resolvedAt} IS NULL) OR (${table.status} <> 'PENDING' AND ${table.resolvedAt} IS NOT NULL)`)
  ]
);

export const approvalDecisionTable = pgTable(
  "approval_decision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    requestId: uuid("request_id").notNull(),
    reviewerAccountId: uuid("reviewer_account_id").notNull(),
    decision: approvalDecision("decision").notNull(),
    reason: text("reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("approval_decision_request_unique").on(table.requestId),
    foreignKey({
      columns: [table.requestId],
      foreignColumns: [approvalRequest.id],
      name: "approval_decision_request_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.requestId, table.tenantId],
      foreignColumns: [approvalRequest.id, approvalRequest.tenantId],
      name: "approval_decision_request_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.reviewerAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "approval_decision_reviewer_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    check("approval_decision_reason_required", sql`(${table.decision} = 'APPROVED') OR (${table.reason} IS NOT NULL AND length(btrim(${table.reason})) > 0)`),
    check("approval_decision_reason_length", sql`${table.reason} IS NULL OR length(${table.reason}) <= 4000`)
  ]
);

export const stateTransition = pgTable(
  "state_transition",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    entityType: text("entity_type").notNull().default("PROJECT"),
    entityId: uuid("entity_id").notNull(),
    fromState: projectStatus("from_state").notNull(),
    toState: projectStatus("to_state").notNull(),
    actorAccountId: uuid("actor_account_id").notNull(),
    approvalRequestId: uuid("approval_request_id"),
    reason: text("reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.entityId, table.tenantId],
      foreignColumns: [project.id, project.tenantId],
      name: "state_transition_project_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.actorAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "state_transition_actor_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.approvalRequestId, table.entityId, table.tenantId],
      foreignColumns: [approvalRequest.id, approvalRequest.resourceId, approvalRequest.tenantId],
      name: "state_transition_request_project_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("state_transition_entity_idx").on(table.tenantId, table.entityId, table.occurredAt),
    check("state_transition_project_only", sql`${table.entityType} = 'PROJECT'`),
    check("state_transition_state_changed", sql`${table.fromState} <> ${table.toState}`)
  ]
);

export const projectComment = pgTable(
  "project_comment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    projectId: uuid("project_id").notNull(),
    approvalRequestId: uuid("approval_request_id").notNull(),
    authorAccountId: uuid("author_account_id").notNull(),
    kind: projectCommentKind("kind").notNull(),
    fieldKey: text("field_key"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.tenantId],
      foreignColumns: [project.id, project.tenantId],
      name: "project_comment_project_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.approvalRequestId, table.projectId, table.tenantId],
      foreignColumns: [approvalRequest.id, approvalRequest.resourceId, approvalRequest.tenantId],
      name: "project_comment_request_project_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.authorAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "project_comment_author_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("project_comment_request_idx").on(table.tenantId, table.approvalRequestId, table.createdAt),
    check("project_comment_body_not_empty", sql`length(btrim(${table.body})) > 0`),
    check("project_comment_body_length", sql`length(${table.body}) <= 4000`),
    check("project_comment_kind_field_consistent", sql`(${table.kind} = 'GLOBAL' AND ${table.fieldKey} IS NULL) OR (${table.kind} = 'FIELD' AND ${table.fieldKey} IS NOT NULL)`),
    check("project_comment_field_allowlist", sql`${table.fieldKey} IS NULL OR ${table.fieldKey} IN ('title', 'summary', 'problemStatement', 'diagnostic', 'projectMode', 'visibility', 'locationLabel', 'plannedStartAt', 'plannedEndAt', 'actualStartAt', 'actualEndAt')`)
  ]
);

export const mediaAsset = pgTable(
  "media_asset",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    projectId: uuid("project_id").notNull(),
    temporaryObjectKey: text("temporary_object_key"),
    objectKey: text("object_key"),
    mime: text("mime").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    etag: text("etag"),
    classification: evidenceClassification("classification").notNull().default("P3"),
    uploadStatus: mediaUploadStatus("upload_status").notNull().default("PENDING_UPLOAD"),
    scanStatus: mediaScanStatus("scan_status").notNull().default("NOT_SCANNED"),
    uploadedByAccountId: uuid("uploaded_by_account_id").notNull(),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionCode: text("rejection_code"),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("media_asset_id_tenant_unique").on(table.id, table.tenantId),
    unique("media_asset_id_project_tenant_unique").on(table.id, table.projectId, table.tenantId),
    uniqueIndex("media_asset_object_key_unique")
      .on(table.tenantId, table.objectKey)
      .where(sql`${table.objectKey} IS NOT NULL`),
    uniqueIndex("media_asset_temp_key_unique")
      .on(table.tenantId, table.temporaryObjectKey)
      .where(sql`${table.temporaryObjectKey} IS NOT NULL`),
    foreignKey({
      columns: [table.projectId, table.tenantId],
      foreignColumns: [project.id, project.tenantId],
      name: "media_asset_project_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.uploadedByAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "media_asset_uploaded_by_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("media_asset_project_status_idx").on(table.tenantId, table.projectId, table.uploadStatus),
    index("media_asset_uploader_status_idx").on(table.tenantId, table.uploadedByAccountId, table.uploadStatus),
    check("media_asset_mime_allowlist", sql`${table.mime} IN ('image/jpeg', 'image/png', 'application/pdf')`),
    check("media_asset_byte_size_positive", sql`${table.byteSize} > 0`),
    check("media_asset_sha256_hex", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
    check("media_asset_dimensions_positive", sql`(${table.width} IS NULL OR ${table.width} > 0) AND (${table.height} IS NULL OR ${table.height} > 0)`),
    check(
      "media_asset_pending_shape",
      sql`${table.uploadStatus} <> 'PENDING_UPLOAD' OR (${table.temporaryObjectKey} IS NOT NULL AND ${table.objectKey} IS NULL AND ${table.verifiedAt} IS NULL AND ${table.rejectedAt} IS NULL AND ${table.rejectionCode} IS NULL)`
    ),
    check(
      "media_asset_verifying_shape",
      sql`${table.uploadStatus} <> 'VERIFYING' OR (${table.temporaryObjectKey} IS NOT NULL AND ${table.objectKey} IS NULL AND ${table.verifiedAt} IS NULL AND ${table.rejectedAt} IS NULL AND ${table.rejectionCode} IS NULL)`
    ),
    check(
      "media_asset_verified_shape",
      sql`${table.uploadStatus} <> 'VERIFIED' OR (${table.temporaryObjectKey} IS NOT NULL AND ${table.objectKey} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL AND ${table.rejectedAt} IS NULL AND ${table.rejectionCode} IS NULL)`
    ),
    check(
      "media_asset_rejected_shape",
      sql`${table.uploadStatus} <> 'REJECTED' OR (${table.objectKey} IS NULL AND ${table.verifiedAt} IS NULL AND ${table.rejectedAt} IS NOT NULL AND ${table.rejectionCode} IS NOT NULL)`
    )
  ]
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    projectId: uuid("project_id").notNull(),
    mediaAssetId: uuid("media_asset_id").notNull(),
    type: evidenceType("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    visibility: evidenceVisibility("visibility").notNull().default("PRIVATE"),
    validationStatus: evidenceValidationStatus("validation_status").notNull().default("UNREVIEWED"),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("evidence_id_tenant_unique").on(table.id, table.tenantId),
    unique("evidence_media_asset_unique").on(table.mediaAssetId),
    foreignKey({
      columns: [table.projectId, table.tenantId],
      foreignColumns: [project.id, project.tenantId],
      name: "evidence_project_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.mediaAssetId, table.tenantId],
      foreignColumns: [mediaAsset.id, mediaAsset.tenantId],
      name: "evidence_media_asset_same_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.mediaAssetId, table.projectId, table.tenantId],
      foreignColumns: [mediaAsset.id, mediaAsset.projectId, mediaAsset.tenantId],
      name: "evidence_media_asset_project_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.createdByAccountId, table.tenantId],
      foreignColumns: [accountPersonLink.accountId, accountPersonLink.tenantId],
      name: "evidence_created_by_tenant_fk"
    }).onDelete("restrict").onUpdate("restrict"),
    index("evidence_project_created_idx").on(table.tenantId, table.projectId, table.createdAt, table.id),
    check("evidence_title_not_empty", sql`length(btrim(${table.title})) > 0`),
    check("evidence_title_length", sql`length(${table.title}) <= 160`),
    check("evidence_description_length", sql`${table.description} IS NULL OR length(${table.description}) <= 2000`),
    check("evidence_slice5_type_allowlist", sql`${table.type} IN ('PHOTO', 'DOCUMENT', 'ATTESTATION', 'EXTERNAL_CAPTURE')`)
  ]
);
