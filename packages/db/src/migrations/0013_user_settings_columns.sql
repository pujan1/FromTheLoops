ALTER TABLE "users" ADD COLUMN "default_display_attribution" "display_attribution" DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pii_purged_at" timestamp with time zone;