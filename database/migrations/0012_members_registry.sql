CREATE TYPE "public"."scout_profile_sex" AS ENUM('FEMALE', 'MALE', 'UNSPECIFIED');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "scout_profile_scout_id_seq" AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;--> statement-breakpoint
CREATE TABLE "scout_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"scout_id" text NOT NULL,
	"sex" "scout_profile_sex" DEFAULT 'UNSPECIFIED' NOT NULL,
	"birth_place" text,
	"primary_phone" text,
	"secondary_phone" text,
	"email" text,
	"guardian_name" text,
	"guardian_phone" text,
	"guardian_relationship" text,
	"insurance_number" text,
	"insurance_year" integer,
	"joined_scouting_at" timestamp with time zone,
	"administrative_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scout_profile_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "scout_profile_person_unique" UNIQUE("person_id"),
	CONSTRAINT "scout_profile_tenant_scout_id_unique" UNIQUE("tenant_id","scout_id"),
	CONSTRAINT "scout_profile_scout_id_shape" CHECK ("scout_profile"."scout_id" ~ '^PC-[0-9]{6,}$'),
	CONSTRAINT "scout_profile_insurance_year_shape" CHECK ("scout_profile"."insurance_year" IS NULL OR "scout_profile"."insurance_year" BETWEEN 2000 AND 2100)
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"branch" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "membership_dates_valid" CHECK ("membership"."ends_at" IS NULL OR "membership"."starts_at" < "membership"."ends_at"),
	CONSTRAINT "membership_active_end_shape" CHECK (("membership"."status" = 'ACTIVE' AND "membership"."ends_at" IS NULL) OR ("membership"."status" = 'ENDED' AND "membership"."ends_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "scout_profile" ADD CONSTRAINT "scout_profile_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "scout_profile" ADD CONSTRAINT "scout_profile_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."person"("id","tenant_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."person"("id","tenant_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_tenant_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."organization"("id","tenant_id") ON DELETE restrict;--> statement-breakpoint
CREATE INDEX "scout_profile_tenant_idx" ON "scout_profile" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scout_profile_scout_id_idx" ON "scout_profile" USING btree ("tenant_id","scout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_one_active_per_person_idx" ON "membership" USING btree ("tenant_id","person_id") WHERE "membership"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "membership_person_idx" ON "membership" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "membership_organization_idx" ON "membership" USING btree ("tenant_id","organization_id");--> statement-breakpoint
CREATE INDEX "membership_status_idx" ON "membership" USING btree ("tenant_id","status");--> statement-breakpoint
INSERT INTO "permission_definition" ("code", "description") VALUES
 ('member.read', 'Read member registry summaries and profiles.'),
 ('member.read_sensitive', 'Read sensitive member profile fields.'),
 ('member.create', 'Create members in scoped structures.'),
 ('member.update', 'Update member profile fields.'),
 ('member.transfer', 'Transfer members between scoped structures.')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN ('member.read','member.read_sensitive','member.create','member.update','member.transfer')
WHERE rd.code = 'REGIONAL_ADMIN'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN ('member.read','member.create','member.update','member.transfer')
WHERE rd.code IN ('GROUP_ADMIN','UNIT_LEADER','DISTRICT_REVIEWER')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN ('member.read')
WHERE rd.code IN ('REGIONAL_PROGRAMME_REVIEWER','DATA_OFFICER')
ON CONFLICT DO NOTHING;
