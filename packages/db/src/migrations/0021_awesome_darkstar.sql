CREATE TYPE "public"."content_flag_reason" AS ENUM('spam', 'harassment', 'pii', 'misinformation', 'off_topic', 'other');--> statement-breakpoint
CREATE TYPE "public"."content_flag_status" AS ENUM('open', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."content_flag_target" AS ENUM('report', 'comment');--> statement-breakpoint
CREATE TABLE "content_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "content_flag_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"flagger_user_id" uuid NOT NULL,
	"reason" "content_flag_reason" NOT NULL,
	"note" text,
	"status" "content_flag_status" DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_flagger_user_id_users_id_fk" FOREIGN KEY ("flagger_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_flags_target_flagger_uq" ON "content_flags" USING btree ("target_type","target_id","flagger_user_id");--> statement-breakpoint
CREATE INDEX "content_flags_target_idx" ON "content_flags" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "content_flags_flagger_created_idx" ON "content_flags" USING btree ("flagger_user_id","created_at");