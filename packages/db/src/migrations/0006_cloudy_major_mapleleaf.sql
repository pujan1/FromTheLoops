ALTER TABLE "interview_reports" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD COLUMN "pii_purged_at" timestamp with time zone;