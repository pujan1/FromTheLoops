import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  displayAttribution,
  reportOutcome,
  reportSource,
  reportStatus,
} from "./enums.js";
import { companies, companyLevels, roles } from "./taxonomy.js";
import { users } from "./users.js";

// `interview_reports` — *the* top-level entity. One row = one submitted
// interview experience. Children: rounds[] → questions[] → question_topics[].
// See PLAN.md §Data model for the canonical field list.
//
// Indexes worth knowing about:
//   - reports_company_role_level_idx (company_id, canonical_role_id, level)
//     This is THE wedge-page index. Every `/companies/[c]/[r]/[l]` page
//     read hits this. Killing it would tank TTFB. Guarded by
//     tests/query-plan.test.ts — EXPLAIN must mention this index name.
//   - reports_created_by_idx — drives the /u/[username] profile page.
//   - reports_status_idx — drives the moderation queue (pending_moderation
//     rows are scanned by mods; far smaller subset than `active`).
//
// FK semantics (see tests/constraints.test.ts for assertions):
//   - created_by_user_id ON DELETE RESTRICT — deleting an authoring user
//     is blocked while their reports exist. Forces the soft-delete path
//     (set status='deleted', preserve audit trail) per PLAN.md §Section
//     230 hygiene. Hard-deleting a user has to first re-attribute or
//     delete their reports.
//   - company_id, canonical_role_id ON DELETE RESTRICT — taxonomy rows
//     can be merged but never silently dropped while reports reference
//     them. Merge ops have to update report FKs first.
//
// Deferred:
//   - `level_id` FK now exists, but the text `level` column stays until
//     a later cutover (the wedge index is built on it).
//   - `evidence_verified` is a denormalized boolean that mirrors
//     "does this user have a user_verifications row for this company?"
//     Will be maintained by a worker job (BullMQ) when verifications
//     change, rather than computed on every read.
export const interviewReports = pgTable(
  "interview_reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    source: reportSource("source").notNull().default("user_submitted"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    canonicalRoleId: uuid("canonical_role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    // Per-company level name. Kept as text (NOT NULL) because the wedge
    // index is built on it (query-plan.test.ts); the text→FK cutover to
    // level_id below finishes later.
    level: text("level").notNull(),
    // Optional FK to the per-company level. Nullable — a company with no
    // levels uses the "N/A" sentinel. RESTRICT mirrors company_id/role_id.
    levelId: uuid("level_id").references(() => companyLevels.id, {
      onDelete: "restrict",
    }),
    // The month the interview took place, stored as the "YYYY-MM" the
    // submission form collects (validated by shared's monthSchema). Required:
    // every report carries a month. Kept as text rather than a date because
    // the product only ever reasons at month granularity; Sprint 3 aggregation
    // groups on this string directly.
    interviewMonth: text("interview_month").notNull(),
    outcome: reportOutcome("outcome"),
    displayAttribution: displayAttribution("display_attribution")
      .notNull()
      .default("anonymous"),
    evidenceVerified: boolean("evidence_verified").notNull().default(false),
    status: reportStatus("status").notNull().default("pending_moderation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // The 24h edit window's hard boundary. Defaulted to now() + 24h at insert:
    // created_at also defaults to now(), and both now() calls resolve to the
    // same transaction timestamp, so locked_at == created_at + 24h exactly. A
    // generated column would be cleaner but `timestamptz + interval` isn't
    // IMMUTABLE, which Postgres requires for generation expressions; a column
    // default has no such constraint. The submission flow shows an "Edit" CTA
    // while now < locked_at; editing in place never rewrites this column, so an
    // edit can't slide the window forward.
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
    // Soft-delete timestamp. Null while live; set to now() when the owner
    // deletes the report (status flips to 'deleted' in the same write). The
    // row stays in the table — RESTRICT FKs + audit hygiene (PLAN.md §230)
    // forbid hard-deleting it — but it's invisible to everyone but admins.
    // The 90-day PII purge keys off this: free-text prose is cleared once a
    // report has been deleted for PII_RETENTION_MS.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Stamped by the purge worker once this deleted report's free-text PII
    // (round experience + question prose) has been cleared. Null = not yet
    // purged; the purge job only targets rows where this is null, so a re-run
    // is a no-op rather than a re-scan of already-cleared rows.
    piiPurgedAt: timestamp("pii_purged_at", { withTimezone: true }),
  },
  (t) => [
    index("reports_company_role_level_idx").on(
      t.companyId,
      t.canonicalRoleId,
      t.level,
    ),
    index("reports_created_by_idx").on(t.createdByUserId),
    index("reports_status_idx").on(t.status),
  ],
);

export type InterviewReport = typeof interviewReports.$inferSelect;
export type NewInterviewReport = typeof interviewReports.$inferInsert;
