import {
  check,
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
