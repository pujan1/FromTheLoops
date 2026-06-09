import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { interviewReports } from "./reports.js";
import { users } from "./users.js";

// `helpful_flags` — "this reader found this report helpful" (Sprint 5 Day 8).
//
// One row = one reader's standing endorsement of one report. It's a TOGGLE, not
// an append-only log: flagging inserts, un-flagging deletes, and the unique
// index (report_id, flagger_user_id) makes a double-flag impossible. The report
// author earns +1 karma per flag from another VERIFIED user (the earn term in
// karma.ts re-checks the flagger's verification live, so the figure self-heals);
// flagging is gated to verified-pro flaggers and rate-limited (50/day) in the
// data-access layer to blunt the sock-puppet vector (sprint risk table).
//
// Cascade: ON DELETE CASCADE on BOTH FKs. If a flagger is hard-deleted (GDPR
// erasure) their flags go with them — same stance as user_verifications. The
// report FK is CASCADE too: a report is normally soft-deleted (the row
// survives, and the karma earn already excludes deleted reports), but if one is
// ever hard-deleted its flags shouldn't dangle.
export const helpfulFlags = pgTable(
  "helpful_flags",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reportId: uuid("report_id")
      .notNull()
      .references(() => interviewReports.id, { onDelete: "cascade" }),
    flaggerUserId: uuid("flagger_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One flag per (report, reader): the toggle's idempotency + anti-double-flag.
    uniqueIndex("helpful_flags_report_flagger_uq").on(t.reportId, t.flaggerUserId),
    // Count flags on a report (detail page badge + the author's karma earn).
    index("helpful_flags_report_idx").on(t.reportId),
    // The rate-limit read: "how many flags has this user cast since T?" — rides
    // (flagger, created_at) so the windowed COUNT is an index range scan.
    index("helpful_flags_flagger_created_idx").on(t.flaggerUserId, t.createdAt),
  ],
);

export type HelpfulFlag = typeof helpfulFlags.$inferSelect;
export type NewHelpfulFlag = typeof helpfulFlags.$inferInsert;
