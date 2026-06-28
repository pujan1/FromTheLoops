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

// Reader endorsements of a report. Toggle (insert/delete), one per (report,
// reader). Earns the author +1 karma per verified flagger; gated + rate-limited
// in the data-access layer. Both FKs CASCADE.
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
    uniqueIndex("helpful_flags_report_flagger_uq").on(t.reportId, t.flaggerUserId),
    index("helpful_flags_report_idx").on(t.reportId),
    index("helpful_flags_flagger_created_idx").on(t.flaggerUserId, t.createdAt), // rate-limit read
  ],
);

export type HelpfulFlag = typeof helpfulFlags.$inferSelect;
export type NewHelpfulFlag = typeof helpfulFlags.$inferInsert;
