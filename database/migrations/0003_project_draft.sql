CREATE TYPE "public"."project_mode" AS ENUM('PLANNED', 'ALREADY_COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'FINAL_SUBMITTED', 'FINAL_APPROVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."project_visibility" AS ENUM('PRIVATE', 'INTERNAL', 'REVIEW_PUBLIC', 'PUBLIC', 'UNPUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"internal_slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"problem_statement" text,
	"diagnostic" text,
	"project_mode" "project_mode" DEFAULT 'PLANNED' NOT NULL,
	"status" "project_status" DEFAULT 'DRAFT' NOT NULL,
	"visibility" "project_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"location_label" text,
	"planned_start_at" timestamp with time zone,
	"planned_end_at" timestamp with time zone,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"project_lead_person_id" uuid NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tenant_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "project_tenant_internal_slug_unique" UNIQUE("tenant_id","internal_slug"),
	CONSTRAINT "project_version_positive" CHECK ("project"."version" >= 1),
	CONSTRAINT "project_title_not_empty" CHECK (length(btrim("project"."title")) > 0),
	CONSTRAINT "project_planned_dates_valid" CHECK ("project"."planned_end_at" IS NULL OR "project"."planned_start_at" IS NULL OR "project"."planned_end_at" >= "project"."planned_start_at"),
	CONSTRAINT "project_actual_dates_valid" CHECK ("project"."actual_end_at" IS NULL OR "project"."actual_start_at" IS NULL OR "project"."actual_end_at" >= "project"."actual_start_at")
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_org_same_tenant_fk" FOREIGN KEY ("owner_org_id","tenant_id") REFERENCES "public"."organization"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_lead_person_same_tenant_fk" FOREIGN KEY ("project_lead_person_id","tenant_id") REFERENCES "public"."person"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_account_tenant_fk" FOREIGN KEY ("created_by_account_id","tenant_id") REFERENCES "public"."account_person_link"("account_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "project_tenant_idx" ON "project" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "project_owner_org_idx" ON "project" USING btree ("tenant_id","owner_org_id");--> statement-breakpoint
CREATE INDEX "project_status_idx" ON "project" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "project_mode_idx" ON "project" USING btree ("tenant_id","project_mode");--> statement-breakpoint
CREATE INDEX "project_updated_at_idx" ON "project" USING btree ("tenant_id","updated_at","id");
--> statement-breakpoint
INSERT INTO "permission_definition" ("code", "description") VALUES
	('project.create', 'Create project drafts within an authorized owner organization scope.'),
	('project.read', 'Read private project drafts within an authorized owner organization scope.'),
	('project.update', 'Update project drafts within an authorized owner organization scope.');
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN (
	'project.create',
	'project.read',
	'project.update'
)
WHERE rd.code IN (
	'UNIT_LEADER',
	'GROUP_ADMIN'
);
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code = 'project.read'
WHERE rd.code IN (
	'DISTRICT_REVIEWER',
	'REGIONAL_PROGRAMME_REVIEWER',
	'REGIONAL_ADMIN',
	'NATIONAL_OBSERVER'
);
