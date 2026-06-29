CREATE TYPE "public"."blocklist_category" AS ENUM('slur', 'pii', 'spam', 'other');--> statement-breakpoint
CREATE TABLE "regex_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" text NOT NULL,
	"label" text NOT NULL,
	"category" "blocklist_category" DEFAULT 'other' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regex_blocklist" ADD CONSTRAINT "regex_blocklist_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regex_blocklist_enabled_idx" ON "regex_blocklist" USING btree ("enabled");