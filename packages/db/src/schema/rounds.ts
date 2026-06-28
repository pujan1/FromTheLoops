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

// Ordered children of interview_reports. order_index unique per report
// (prevents two "round 0"). CASCADE on report_id (only reached on hard-delete).
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
