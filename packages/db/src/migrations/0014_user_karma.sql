ALTER TABLE "users" ADD COLUMN "karma" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "karma_processed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "events_karma_pending_idx" ON "events" USING btree ("created_at") WHERE "events"."karma_processed_at" IS NULL;