CREATE TYPE "public"."evidence_classification" AS ENUM('P1', 'P2', 'P3');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('PHOTO', 'VIDEO_LINK', 'DOCUMENT', 'ATTESTATION', 'ATTENDANCE_LIST', 'MEASUREMENT', 'LOCATION', 'TESTIMONIAL', 'YOUTH_OUTPUT', 'RECEIPT', 'EXTERNAL_CAPTURE');--> statement-breakpoint
CREATE TYPE "public"."evidence_validation_status" AS ENUM('UNREVIEWED', 'VALIDATED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."evidence_visibility" AS ENUM('PRIVATE', 'INTERNAL');--> statement-breakpoint
CREATE TYPE "public"."media_scan_status" AS ENUM('NOT_SCANNED');--> statement-breakpoint
CREATE TYPE "public"."media_upload_status" AS ENUM('PENDING_UPLOAD', 'VERIFYING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"type" "evidence_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"occurred_at" timestamp with time zone,
	"visibility" "evidence_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"validation_status" "evidence_validation_status" DEFAULT 'UNREVIEWED' NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "evidence_media_asset_unique" UNIQUE("media_asset_id"),
	CONSTRAINT "evidence_title_not_empty" CHECK (length(btrim("evidence"."title")) > 0),
	CONSTRAINT "evidence_title_length" CHECK (length("evidence"."title") <= 160),
	CONSTRAINT "evidence_description_length" CHECK ("evidence"."description" IS NULL OR length("evidence"."description") <= 2000),
	CONSTRAINT "evidence_slice5_type_allowlist" CHECK ("evidence"."type" IN ('PHOTO', 'DOCUMENT', 'ATTESTATION', 'EXTERNAL_CAPTURE'))
);
--> statement-breakpoint
CREATE TABLE "media_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"temporary_object_key" text,
	"object_key" text,
	"mime" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"etag" text,
	"classification" "evidence_classification" DEFAULT 'P3' NOT NULL,
	"upload_status" "media_upload_status" DEFAULT 'PENDING_UPLOAD' NOT NULL,
	"scan_status" "media_scan_status" DEFAULT 'NOT_SCANNED' NOT NULL,
	"uploaded_by_account_id" uuid NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejection_code" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_asset_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "media_asset_id_project_tenant_unique" UNIQUE("id","project_id","tenant_id"),
	CONSTRAINT "media_asset_mime_allowlist" CHECK ("media_asset"."mime" IN ('image/jpeg', 'image/png', 'application/pdf')),
	CONSTRAINT "media_asset_byte_size_positive" CHECK ("media_asset"."byte_size" > 0),
	CONSTRAINT "media_asset_sha256_hex" CHECK ("media_asset"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_asset_dimensions_positive" CHECK (("media_asset"."width" IS NULL OR "media_asset"."width" > 0) AND ("media_asset"."height" IS NULL OR "media_asset"."height" > 0)),
	CONSTRAINT "media_asset_verified_shape" CHECK (("media_asset"."upload_status" = 'VERIFIED' AND "media_asset"."object_key" IS NOT NULL AND "media_asset"."verified_at" IS NOT NULL AND "media_asset"."rejected_at" IS NULL AND "media_asset"."rejection_code" IS NULL) OR ("media_asset"."upload_status" <> 'VERIFIED')),
	CONSTRAINT "media_asset_rejected_shape" CHECK (("media_asset"."upload_status" = 'REJECTED' AND "media_asset"."rejected_at" IS NOT NULL AND "media_asset"."rejection_code" IS NOT NULL) OR ("media_asset"."upload_status" <> 'REJECTED')),
	CONSTRAINT "media_asset_pending_temp_key" CHECK (("media_asset"."upload_status" <> 'PENDING_UPLOAD' AND "media_asset"."upload_status" <> 'VERIFYING') OR "media_asset"."temporary_object_key" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_project_same_tenant_fk" FOREIGN KEY ("project_id","tenant_id") REFERENCES "public"."project"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_media_asset_same_tenant_fk" FOREIGN KEY ("media_asset_id","tenant_id") REFERENCES "public"."media_asset"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_media_asset_project_tenant_fk" FOREIGN KEY ("media_asset_id","project_id","tenant_id") REFERENCES "public"."media_asset"("id","project_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_created_by_tenant_fk" FOREIGN KEY ("created_by_account_id","tenant_id") REFERENCES "public"."account_person_link"("account_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_project_same_tenant_fk" FOREIGN KEY ("project_id","tenant_id") REFERENCES "public"."project"("id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploaded_by_tenant_fk" FOREIGN KEY ("uploaded_by_account_id","tenant_id") REFERENCES "public"."account_person_link"("account_id","tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "evidence_project_created_idx" ON "evidence" USING btree ("tenant_id","project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_object_key_unique" ON "media_asset" USING btree ("tenant_id","object_key") WHERE "media_asset"."object_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_temp_key_unique" ON "media_asset" USING btree ("tenant_id","temporary_object_key") WHERE "media_asset"."temporary_object_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "media_asset_project_status_idx" ON "media_asset" USING btree ("tenant_id","project_id","upload_status");--> statement-breakpoint
CREATE INDEX "media_asset_uploader_status_idx" ON "media_asset" USING btree ("tenant_id","uploaded_by_account_id","upload_status");--> statement-breakpoint
INSERT INTO "permission_definition" ("code", "description") VALUES
  ('evidence.create', 'Initiate and confirm private project Evidence uploads within an authorized project owner scope'),
  ('evidence.read', 'Read private project Evidence metadata within an authorized project owner scope'),
  ('evidence.download', 'Issue short-lived private Evidence download URLs within an authorized project owner scope')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN ('evidence.create', 'evidence.read', 'evidence.download')
WHERE rd.code IN ('UNIT_LEADER', 'GROUP_ADMIN')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rd.id, pd.id
FROM "role_definition" rd
JOIN "permission_definition" pd ON pd.code IN ('evidence.read', 'evidence.download')
WHERE rd.code = 'REGIONAL_PROGRAMME_REVIEWER'
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_verified_media_asset_object_key_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.upload_status = 'VERIFIED' AND OLD.object_key IS DISTINCT FROM NEW.object_key THEN
    RAISE EXCEPTION 'verified media asset object_key is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER media_asset_verified_object_key_immutable
BEFORE UPDATE ON "media_asset"
FOR EACH ROW EXECUTE FUNCTION reject_verified_media_asset_object_key_change();
