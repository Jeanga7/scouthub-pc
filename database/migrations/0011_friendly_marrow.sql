ALTER TABLE "appointment" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "ended_by" uuid;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "rejection_reason" text;