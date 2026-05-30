CREATE TYPE "public"."taxonomy_source" AS ENUM('seed_curated', 'user_suggested');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_status" AS ENUM('active', 'pending', 'merged');--> statement-breakpoint
CREATE TABLE "company_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" "taxonomy_status" DEFAULT 'active' NOT NULL,
	"source" "taxonomy_source" DEFAULT 'user_suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "status" "taxonomy_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "source" "taxonomy_source" DEFAULT 'user_suggested' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "suggested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "status" "taxonomy_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "source" "taxonomy_source" DEFAULT 'user_suggested' NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD COLUMN "level_id" uuid;--> statement-breakpoint
ALTER TABLE "company_levels" ADD CONSTRAINT "company_levels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_drafts" ADD CONSTRAINT "submission_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_levels_company_slug_uq" ON "company_levels" USING btree ("company_id","slug");--> statement-breakpoint
CREATE INDEX "company_levels_company_idx" ON "company_levels" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "drafts_user_idx" ON "submission_drafts" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_suggested_by_user_id_users_id_fk" FOREIGN KEY ("suggested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_merged_into_id_roles_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_level_id_company_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."company_levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "roles_status_idx" ON "roles" USING btree ("status");