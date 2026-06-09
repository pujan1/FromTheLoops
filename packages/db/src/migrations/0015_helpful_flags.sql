CREATE TABLE "helpful_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"flagger_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "helpful_flags" ADD CONSTRAINT "helpful_flags_report_id_interview_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."interview_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpful_flags" ADD CONSTRAINT "helpful_flags_flagger_user_id_users_id_fk" FOREIGN KEY ("flagger_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "helpful_flags_report_flagger_uq" ON "helpful_flags" USING btree ("report_id","flagger_user_id");--> statement-breakpoint
CREATE INDEX "helpful_flags_report_idx" ON "helpful_flags" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "helpful_flags_flagger_created_idx" ON "helpful_flags" USING btree ("flagger_user_id","created_at");