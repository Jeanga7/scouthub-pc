CREATE TYPE "public"."organization_type" AS ENUM('NSO', 'REGION', 'DISTRICT', 'GROUP', 'UNIT', 'TEAM');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('DRAFT', 'ACTIVE');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_kind" AS ENUM('SYSTEM', 'USER', 'SERVICE');--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" "organization_type" NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"status" "organization_status" DEFAULT 'DRAFT' NOT NULL,
	"path" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"location_label" text,
	"active_from" timestamp with time zone,
	"active_until" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "organization_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "organization_tenant_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "organization_depth_non_negative" CHECK ("depth" >= 0),
	CONSTRAINT "organization_version_positive" CHECK ("version" >= 1),
	CONSTRAINT "organization_name_not_empty" CHECK (length(btrim("name")) > 0),
	CONSTRAINT "organization_code_not_empty" CHECK (length(btrim("code")) > 0),
	CONSTRAINT "organization_active_period_valid" CHECK ("active_until" IS NULL OR "active_from" IS NULL OR "active_until" >= "active_from"),
	CONSTRAINT "organization_root_parent_valid" CHECK (("type" = 'NSO' AND "parent_id" IS NULL AND "id" = "tenant_id" AND "depth" = 0) OR ("type" <> 'NSO' AND "parent_id" IS NOT NULL)),
	CONSTRAINT "organization_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_parent_same_tenant_fk" FOREIGN KEY ("parent_id","tenant_id") REFERENCES "organization"("id","tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
CREATE INDEX "organization_tenant_idx" ON "organization" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "organization_parent_idx" ON "organization" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX "organization_path_idx" ON "organization" USING btree ("tenant_id","path" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "organization_type_idx" ON "organization" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE INDEX "organization_status_idx" ON "organization" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_kind" "audit_actor_kind" NOT NULL,
	"actor_id" uuid,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_event_tenant_resource_idx" ON "audit_event" USING btree ("tenant_id","resource_type","resource_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_tenant_action_idx" ON "audit_event" USING btree ("tenant_id","action");--> statement-breakpoint
-- Slice 1 audit is append-only: corrections happen through new events, not mutation.
CREATE OR REPLACE FUNCTION prevent_audit_event_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'audit_event is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_event_no_update
BEFORE UPDATE ON "audit_event"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_changes();--> statement-breakpoint
CREATE TRIGGER audit_event_no_delete
BEFORE DELETE ON "audit_event"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_changes();
