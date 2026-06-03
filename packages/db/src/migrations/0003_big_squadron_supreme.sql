ALTER TABLE "topics" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "status" "taxonomy_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "source" "taxonomy_source" DEFAULT 'user_suggested' NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "suggested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_suggested_by_user_id_users_id_fk" FOREIGN KEY ("suggested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topics_status_idx" ON "topics" USING btree ("status");