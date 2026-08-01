CREATE TYPE "public"."outbox_event_status" AS ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_event_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "outbox_events_attempts_non_negative" CHECK ("outbox_events"."attempts" >= 0),
	CONSTRAINT "outbox_events_aggregate_type_lowercase" CHECK ("outbox_events"."aggregate_type" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "outbox_events_event_type_shape" CHECK ("outbox_events"."event_type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
	CONSTRAINT "outbox_events_processed_at_shape" CHECK (("outbox_events"."status" IN ('PENDING', 'PROCESSING') AND "outbox_events"."processed_at" IS NULL)
          OR ("outbox_events"."status" IN ('SENT', 'FAILED') AND "outbox_events"."processed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "outbox_events_tenant_idx" ON "outbox_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");