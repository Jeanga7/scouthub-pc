CREATE TYPE "public"."account_invitation_status" AS ENUM('CREATING', 'PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'ANONYMIZED');--> statement-breakpoint
CREATE TYPE "public"."person_classification" AS ENUM('P2');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('ACTIVE', 'INACTIVE', 'ANONYMIZED');--> statement-breakpoint
CREATE TYPE "public"."role_scope_type" AS ENUM('OWN', 'UNIT', 'GROUP', 'DISTRICT', 'REGION', 'NATIONAL', 'GLOBAL_TECH');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_identity_id" text,
	"primary_email" text NOT NULL,
	"status" "account_status" DEFAULT 'INVITED' NOT NULL,
	"last_login_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_primary_email_not_empty" CHECK (length(btrim("account"."primary_email")) > 0)
);
--> statement-breakpoint
CREATE TABLE "account_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"email" text NOT NULL,
	"intended_role_id" uuid NOT NULL,
	"intended_scope_org_id" uuid NOT NULL,
	"status" "account_invitation_status" DEFAULT 'CREATING' NOT NULL,
	"external_invitation_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"invited_by_account_id" uuid NOT NULL,
	"adult_eligibility_attested_at" timestamp with time zone NOT NULL,
	"adult_eligibility_attested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_invitation_email_not_empty" CHECK (length(btrim("account_invitation"."email")) > 0)
);
--> statement-breakpoint
CREATE TABLE "account_person_link" (
	"account_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_person_link_account_id_tenant_id_pk" PRIMARY KEY("account_id","tenant_id"),
	CONSTRAINT "account_person_link_person_unique" UNIQUE("person_id")
);
--> statement-breakpoint
CREATE TABLE "permission_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_definition_code_unique" UNIQUE("code"),
	CONSTRAINT "permission_definition_code_not_empty" CHECK (length(btrim("permission_definition"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"display_name" text NOT NULL,
	"birth_date" timestamp with time zone,
	"classification" "person_classification" DEFAULT 'P2' NOT NULL,
	"status" "person_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_first_name_not_empty" CHECK (length(btrim("person"."first_name")) > 0),
	CONSTRAINT "person_last_name_not_empty" CHECK (length(btrim("person"."last_name")) > 0),
	CONSTRAINT "person_display_name_not_empty" CHECK (length(btrim("person"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "role_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_type" "role_scope_type" NOT NULL,
	"scope_org_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"granted_by_account_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_account_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_assignment_dates_valid" CHECK ("role_assignment"."ends_at" IS NULL OR "role_assignment"."starts_at" < "role_assignment"."ends_at"),
	CONSTRAINT "role_assignment_scope_org_required" CHECK (("role_assignment"."scope_type" = 'GLOBAL_TECH' AND "role_assignment"."scope_org_id" IS NULL) OR ("role_assignment"."scope_type" <> 'GLOBAL_TECH' AND "role_assignment"."scope_org_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "role_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_definition_code_unique" UNIQUE("code"),
	CONSTRAINT "role_definition_code_not_empty" CHECK (length(btrim("role_definition"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_person_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_intended_role_fk" FOREIGN KEY ("intended_role_id") REFERENCES "public"."role_definition"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_scope_org_same_tenant_fk" FOREIGN KEY ("intended_scope_org_id","tenant_id") REFERENCES "public"."organization"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_invitation" ADD CONSTRAINT "account_invitation_invited_by_fk" FOREIGN KEY ("invited_by_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_person_link" ADD CONSTRAINT "account_person_link_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_person_link" ADD CONSTRAINT "account_person_link_person_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "account_person_link" ADD CONSTRAINT "account_person_link_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_role_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_definition"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_scope_org_same_tenant_fk" FOREIGN KEY ("scope_org_id","tenant_id") REFERENCES "public"."organization"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_definition"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission_definition"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "account_external_identity_unique" ON "account" USING btree ("external_identity_id") WHERE "account"."external_identity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "account_primary_email_idx" ON "account" USING btree ("primary_email");--> statement-breakpoint
CREATE INDEX "account_status_idx" ON "account" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "account_invitation_external_unique" ON "account_invitation" USING btree ("external_invitation_id") WHERE "account_invitation"."external_invitation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "account_invitation_tenant_status_idx" ON "account_invitation" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "account_invitation_email_idx" ON "account_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "person_tenant_idx" ON "person" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "role_assignment_account_idx" ON "role_assignment" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "role_assignment_tenant_scope_idx" ON "role_assignment" USING btree ("tenant_id","scope_org_id");--> statement-breakpoint
CREATE INDEX "role_assignment_active_idx" ON "role_assignment" USING btree ("tenant_id","account_id","starts_at","ends_at","revoked_at");
--> statement-breakpoint
INSERT INTO "permission_definition" ("code", "description") VALUES
	('organization.read', 'Read organizations within an authorized scope.'),
	('organization.create', 'Create organizations within an authorized scope.'),
	('organization.update', 'Update organizations within an authorized scope.'),
	('organization.activate', 'Activate organizations within an authorized scope.'),
	('organization.move', 'Move organizations within an authorized scope.'),
	('invitation.create', 'Create adult account invitations.'),
	('invitation.read', 'Read adult account invitations.'),
	('invitation.revoke', 'Revoke adult account invitations.'),
	('role.read', 'Read role assignments.'),
	('role.assign', 'Assign roles.'),
	('role.revoke', 'Revoke role assignments.'),
	('account.read', 'Read accounts.'),
	('account.suspend', 'Suspend accounts.'),
	('audit.read', 'Read audit events.');
--> statement-breakpoint
INSERT INTO "role_definition" ("code", "name", "description") VALUES
	('PROJECT_CONTRIBUTOR', 'Project Contributor', 'Future project contributor role.'),
	('UNIT_LEADER', 'Unit Leader', 'Reads their unit.'),
	('GROUP_ADMIN', 'Group Admin', 'Reads their group and descendants.'),
	('DISTRICT_REVIEWER', 'District Reviewer', 'Reads their district and descendants.'),
	('REGIONAL_PROGRAMME_REVIEWER', 'Regional Programme Reviewer', 'Reads regional programme resources.'),
	('REGIONAL_ADMIN', 'Regional Admin', 'Administers organizations and access within a region.'),
	('REGIONAL_COMMS', 'Regional Comms', 'Reads minimal regional organization data.'),
	('DATA_OFFICER', 'Data Officer', 'Reads audit and necessary metadata.'),
	('NATIONAL_OBSERVER', 'National Observer', 'Read-only observer role.'),
	('PLATFORM_ADMIN', 'Platform Admin', 'Technical role without business data access by default.');
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code = 'organization.read'
WHERE rd.code IN (
	'UNIT_LEADER',
	'GROUP_ADMIN',
	'DISTRICT_REVIEWER',
	'REGIONAL_PROGRAMME_REVIEWER',
	'REGIONAL_ADMIN',
	'REGIONAL_COMMS',
	'DATA_OFFICER',
	'NATIONAL_OBSERVER'
);
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN (
	'organization.create',
	'organization.update',
	'organization.activate',
	'organization.move',
	'invitation.create',
	'invitation.read',
	'invitation.revoke',
	'role.read',
	'role.assign',
	'role.revoke',
	'account.read',
	'account.suspend',
	'audit.read'
)
WHERE rd.code = 'REGIONAL_ADMIN';
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code = 'audit.read'
WHERE rd.code = 'DATA_OFFICER';
