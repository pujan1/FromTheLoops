import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { roundRating, roundType } from "./enums.js";
import { interviewReports } from "./reports.js";

// `rounds` — ordered children of interview_reports.
//
// Ordering: `order_index` is required and unique per report. UI presents
// rounds in declared order (round 0 = recruiter screen, round N = final).
// Unique (report_id, order_index) prevents two "round 0" rows on the same
// report — asserted in tests/constraints.test.ts.
//
// Cascade: ON DELETE CASCADE on report_id. Deleting a report wipes its
// rounds (and rounds' questions). This is the only place we use CASCADE
// among the report family — the report itself uses soft-delete via
// status='deleted', so this cascade is only reached on hard-delete (admin
// purge, GDPR erasure).
//
// Why no FK from questions back to reports: we infer report ownership
// via round_id → reports. Saves an index and prevents the two FKs from
// drifting on edits.
export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reportId: uuid("report_id")
      .notNull()
      .references(() => interviewReports.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    roundType: roundType("round_type").notNull(),
    rating: roundRating("rating").notNull(),
    experienceProse: text("experience_prose"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("rounds_report_idx").on(t.reportId),
    uniqueIndex("rounds_report_order_uq").on(t.reportId, t.orderIndex),
  ],
);

export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
