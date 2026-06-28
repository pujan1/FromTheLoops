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

// The top-level entity. Children: rounds[] → questions[] → question_topics[].
// reports_company_role_level_idx is THE wedge-page index — every
// /companies/[c]/[r]/[l] read hits it (guarded by tests/query-plan.test.ts).
// All FKs are ON DELETE RESTRICT, forcing soft-delete + merge-before-drop.
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
    level: text("level").notNull(), // text, not levelId FK: the wedge index is built on it
    // Nullable — a company with no levels uses the "N/A" sentinel.
    levelId: uuid("level_id").references(() => companyLevels.id, {
      onDelete: "restrict",
    }),
    interviewMonth: text("interview_month").notNull(), // "YYYY-MM"; product reasons at month grain
    outcome: reportOutcome("outcome"),
    displayAttribution: displayAttribution("display_attribution")
      .notNull()
      .default("anonymous"),
    evidenceVerified: boolean("evidence_verified").notNull().default(false),
    status: reportStatus("status").notNull().default("pending_moderation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // 24h edit-window boundary. A column default, not a generated column, since
    // `timestamptz + interval` isn't IMMUTABLE. Editing never rewrites it.
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft-delete; PII purge keys off this
    piiPurgedAt: timestamp("pii_purged_at", { withTimezone: true }), // null = purge job still targets it
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
