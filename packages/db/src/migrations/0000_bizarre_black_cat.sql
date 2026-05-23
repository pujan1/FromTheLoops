CREATE TYPE "public"."display_attribution" AS ENUM('display_name', 'anonymous');--> statement-breakpoint
CREATE TYPE "public"."mod_action_type" AS ENUM('approve', 'reject', 'merge', 'ban', 'delete', 'edit_taxonomy');--> statement-breakpoint
CREATE TYPE "public"."report_outcome" AS ENUM('offer', 'reject', 'withdrew', 'ghosted', 'pending');--> statement-breakpoint
CREATE TYPE "public"."report_source" AS ENUM('seed_dummy', 'seed_curated', 'user_submitted', 'imported');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('active', 'pending_moderation', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."round_rating" AS ENUM('positive', 'mixed', 'negative');--> statement-breakpoint
CREATE TYPE "public"."round_type" AS ENUM('recruiter-screen', 'technical-phone', 'onsite-coding', 'onsite-system-design', 'onsite-behavioral', 'take-home', 'hiring-manager', 'exec-final', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('work_email', 'linkedin', 'manual');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text,
	"email" text,
	"username" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "report_source" DEFAULT 'user_submitted' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"canonical_role_id" uuid NOT NULL,
	"level" text NOT NULL,
	"outcome" "report_outcome",
	"display_attribution" "display_attribution" DEFAULT 'anonymous' NOT NULL,
	"evidence_verified" boolean DEFAULT false NOT NULL,
	"status" "report_status" DEFAULT 'pending_moderation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"round_type" "round_type" NOT NULL,
	"rating" "round_rating" NOT NULL,
	"experience_prose" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_topics" (
	"question_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "question_topics_question_id_topic_id_pk" PRIMARY KEY("question_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"question_prose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"verified_via" "verification_method" NOT NULL,
	"evidence_token_hash" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mod_action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mod_user_id" uuid NOT NULL,
	"action_type" "mod_action_type" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_canonical_role_id_roles_id_fk" FOREIGN KEY ("canonical_role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_report_id_interview_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."interview_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_action_logs" ADD CONSTRAINT "mod_action_logs_mod_user_id_users_id_fk" FOREIGN KEY ("mod_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_uq" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_uq" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_slug_uq" ON "roles" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_slug_uq" ON "topics" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "reports_company_role_level_idx" ON "interview_reports" USING btree ("company_id","canonical_role_id","level");--> statement-breakpoint
CREATE INDEX "reports_created_by_idx" ON "interview_reports" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "interview_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rounds_report_idx" ON "rounds" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_report_order_uq" ON "rounds" USING btree ("report_id","order_index");--> statement-breakpoint
CREATE INDEX "question_topics_topic_idx" ON "question_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "questions_round_idx" ON "questions" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_round_order_uq" ON "questions" USING btree ("round_id","order_index");--> statement-breakpoint
CREATE INDEX "verifications_user_idx" ON "user_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_company_idx" ON "user_verifications" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "mod_action_target_idx" ON "mod_action_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "mod_action_mod_idx" ON "mod_action_logs" USING btree ("mod_user_id");