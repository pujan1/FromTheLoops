CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"op" text NOT NULL,
	"report_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"canonical_role_id" uuid NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aggregate_processed_at" timestamp with time zone,
	"search_processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "events_aggregate_pending_idx" ON "events" USING btree ("created_at") WHERE "events"."aggregate_processed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "events_search_pending_idx" ON "events" USING btree ("created_at") WHERE "events"."search_processed_at" IS NULL;