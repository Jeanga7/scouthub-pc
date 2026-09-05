CREATE TYPE "public"."appointment_status" AS ENUM('PENDING', 'ACTIVE', 'REJECTED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."holder_policy" AS ENUM('SINGLE', 'MULTIPLE');--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"scope_org_id" uuid NOT NULL,
	"status" "appointment_status" DEFAULT 'PENDING' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"proposed_by" uuid NOT NULL,
	"validated_by" uuid,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_dates_valid" CHECK ("appointment"."ends_at" IS NULL OR "appointment"."starts_at" < "appointment"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"allowed_scope_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sector" text,
	"branch" text,
	"holder_policy" "holder_policy" DEFAULT 'MULTIPLE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "position_tenant_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."person"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_position_tenant_fk" FOREIGN KEY ("position_id","tenant_id") REFERENCES "public"."position"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_scope_tenant_fk" FOREIGN KEY ("scope_org_id","tenant_id") REFERENCES "public"."organization"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_tenant_idx" ON "appointment" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "appointment_person_idx" ON "appointment" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "appointment_position_idx" ON "appointment" USING btree ("tenant_id","position_id");--> statement-breakpoint
CREATE INDEX "appointment_scope_idx" ON "appointment" USING btree ("tenant_id","scope_org_id");--> statement-breakpoint
CREATE INDEX "appointment_status_dates_idx" ON "appointment" USING btree ("tenant_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "position_tenant_idx" ON "position" USING btree ("tenant_id");
