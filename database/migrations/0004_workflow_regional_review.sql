CREATE TYPE "public"."approval_decision_type" AS ENUM('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."approval_request_status" AS ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."project_comment_kind" AS ENUM('GLOBAL', 'FIELD');--> statement-breakpoint
CREATE TABLE "approval_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"reviewer_account_id" uuid NOT NULL,
	"decision" "approval_decision_type" NOT NULL,
	"reason" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_decision_request_unique" UNIQUE("request_id"),
	CONSTRAINT "approval_decision_reason_required" CHECK (("approval_decision"."decision" = 'APPROVED') OR ("approval_decision"."reason" IS NOT NULL AND length(btrim("approval_decision"."reason")) > 0)),
	CONSTRAINT "approval_decision_reason_length" CHECK ("approval_decision"."reason" IS NULL OR length("approval_decision"."reason") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "approval_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type" text DEFAULT 'PROJECT' NOT NULL,
	"resource_id" uuid NOT NULL,
	"workflow" text DEFAULT 'PROJECT' NOT NULL,
	"stage" text DEFAULT 'INITIAL_REVIEW' NOT NULL,
	"status" "approval_request_status" DEFAULT 'PENDING' NOT NULL,
	"submitted_project_version" integer NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_request_project_tenant_unique" UNIQUE("id","resource_id","tenant_id"),
	CONSTRAINT "approval_request_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "approval_request_submitted_version_positive" CHECK ("approval_request"."submitted_project_version" >= 1),
	CONSTRAINT "approval_request_project_only" CHECK ("approval_request"."resource_type" = 'PROJECT' AND "approval_request"."workflow" = 'PROJECT' AND "approval_request"."stage" = 'INITIAL_REVIEW'),
	CONSTRAINT "approval_request_resolved_when_terminal" CHECK (("approval_request"."status" = 'PENDING' AND "approval_request"."resolved_at" IS NULL) OR ("approval_request"."status" <> 'PENDING' AND "approval_request"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "project_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"author_account_id" uuid NOT NULL,
	"kind" "project_comment_kind" NOT NULL,
	"field_key" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_comment_body_not_empty" CHECK (length(btrim("project_comment"."body")) > 0),
	CONSTRAINT "project_comment_body_length" CHECK (length("project_comment"."body") <= 4000),
	CONSTRAINT "project_comment_kind_field_consistent" CHECK (("project_comment"."kind" = 'GLOBAL' AND "project_comment"."field_key" IS NULL) OR ("project_comment"."kind" = 'FIELD' AND "project_comment"."field_key" IS NOT NULL)),
	CONSTRAINT "project_comment_field_allowlist" CHECK ("project_comment"."field_key" IS NULL OR "project_comment"."field_key" IN ('title', 'summary', 'problemStatement', 'diagnostic', 'projectMode', 'visibility', 'locationLabel', 'plannedStartAt', 'plannedEndAt', 'actualStartAt', 'actualEndAt'))
);
--> statement-breakpoint
CREATE TABLE "state_transition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'PROJECT' NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_state" "project_status" NOT NULL,
	"to_state" "project_status" NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"approval_request_id" uuid,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "state_transition_project_only" CHECK ("state_transition"."entity_type" = 'PROJECT'),
	CONSTRAINT "state_transition_state_changed" CHECK ("state_transition"."from_state" <> "state_transition"."to_state")
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_id_tenant_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_request_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_request"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_request_tenant_fk" FOREIGN KEY ("request_id","tenant_id") REFERENCES "public"."approval_request"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_reviewer_tenant_fk" FOREIGN KEY ("reviewer_account_id","tenant_id") REFERENCES "public"."account_person_link"("account_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_project_same_tenant_fk" FOREIGN KEY ("resource_id","tenant_id") REFERENCES "public"."project"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_requested_by_tenant_fk" FOREIGN KEY ("requested_by_account_id","tenant_id") REFERENCES "public"."account_person_link"("account_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_project_same_tenant_fk" FOREIGN KEY ("project_id","tenant_id") REFERENCES "public"."project"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_request_project_tenant_fk" FOREIGN KEY ("approval_request_id","project_id","tenant_id") REFERENCES "public"."approval_request"("id","resource_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "project_comment" ADD CONSTRAINT "project_comment_author_tenant_fk" FOREIGN KEY ("author_account_id","tenant_id") REFERENCES "public"."account_person_link"("account_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "state_transition" ADD CONSTRAINT "state_transition_project_same_tenant_fk" FOREIGN KEY ("entity_id","tenant_id") REFERENCES "public"."project"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "state_transition" ADD CONSTRAINT "state_transition_actor_tenant_fk" FOREIGN KEY ("actor_account_id","tenant_id") REFERENCES "public"."account_person_link"("account_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "state_transition" ADD CONSTRAINT "state_transition_request_project_tenant_fk" FOREIGN KEY ("approval_request_id","entity_id","tenant_id") REFERENCES "public"."approval_request"("id","resource_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_request_one_pending_project_stage_unique" ON "approval_request" USING btree ("tenant_id","resource_id","workflow","stage") WHERE "approval_request"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "approval_request_queue_idx" ON "approval_request" USING btree ("tenant_id","status","requested_at","id");--> statement-breakpoint
CREATE INDEX "project_comment_request_idx" ON "project_comment" USING btree ("tenant_id","approval_request_id","created_at");--> statement-breakpoint
CREATE INDEX "state_transition_entity_idx" ON "state_transition" USING btree ("tenant_id","entity_id","occurred_at");--> statement-breakpoint
INSERT INTO "permission_definition" ("code", "description") VALUES
  ('project.submit', 'Submit project drafts for initial regional review'),
  ('project.comment', 'Add review comments to projects'),
  ('project.review', 'Start regional project reviews'),
  ('project.request_changes', 'Request project changes during regional review'),
  ('project.approve', 'Approve projects for execution'),
  ('project.reject', 'Reject projects during regional review')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN ('project.submit', 'project.comment')
WHERE rd.code IN ('UNIT_LEADER', 'GROUP_ADMIN')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN (
  'project.comment',
  'project.review',
  'project.request_changes',
  'project.approve',
  'project.reject'
)
WHERE rd.code = 'REGIONAL_PROGRAMME_REVIEWER'
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_project_workflow_history_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'project workflow history is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER approval_decision_append_only
BEFORE UPDATE OR DELETE ON "approval_decision"
FOR EACH ROW EXECUTE FUNCTION reject_project_workflow_history_mutation();--> statement-breakpoint
CREATE TRIGGER state_transition_append_only
BEFORE UPDATE OR DELETE ON "state_transition"
FOR EACH ROW EXECUTE FUNCTION reject_project_workflow_history_mutation();--> statement-breakpoint
CREATE TRIGGER project_comment_append_only
BEFORE UPDATE OR DELETE ON "project_comment"
FOR EACH ROW EXECUTE FUNCTION reject_project_workflow_history_mutation();
