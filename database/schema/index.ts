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
    depth: integer("depth").notNull(),
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
    index("organization_path_idx").on(table.tenantId, table.path),
    index("organization_type_idx").on(table.tenantId, table.type),
    index("organization_status_idx").on(table.tenantId, table.status),
    check("organization_depth_non_negative", sql`${table.depth} >= 0`),
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
