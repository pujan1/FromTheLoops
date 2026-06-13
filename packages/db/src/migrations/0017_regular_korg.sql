CREATE TYPE "public"."comment_status" AS ENUM('active', 'hidden', 'deleted');--> statement-breakpoint
ALTER TYPE "public"."mod_action_type" ADD VALUE 'hide' BEFORE 'edit_taxonomy';--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"display_attribution" "display_attribution" DEFAULT 'anonymous' NOT NULL,
	"reply_to_comment_id" uuid,
	"quoted_question_id" uuid,
	"quoted_text" text,
	"status" "comment_status" DEFAULT 'active' NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"pii_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_report_id_interview_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."interview_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_to_comment_id_comments_id_fk" FOREIGN KEY ("reply_to_comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_quoted_question_id_questions_id_fk" FOREIGN KEY ("quoted_question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_report_id_interview_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."interview_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_report_created_idx" ON "comments" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "comments_reply_to_idx" ON "comments" USING btree ("reply_to_comment_id");--> statement-breakpoint
CREATE INDEX "comments_quoted_question_idx" ON "comments" USING btree ("quoted_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_likes_comment_user_uq" ON "comment_likes" USING btree ("comment_id","user_id");--> statement-breakpoint
CREATE INDEX "comment_likes_comment_idx" ON "comment_likes" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "comment_likes_user_created_idx" ON "comment_likes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_likes_report_user_uq" ON "post_likes" USING btree ("report_id","user_id");--> statement-breakpoint
CREATE INDEX "post_likes_report_idx" ON "post_likes" USING btree ("report_id");