import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Transactional outbox: every report write inserts a row in the same tx. An
// AFTER INSERT trigger fires pg_notify, but the row is the source of truth and a
// fallback poller catches dropped NOTIFYs. Three consumers (aggregate, search,
// karma) drain independently via the *_processed_at columns. No FKs (append-only;
// cell columns denormalized so a delete event survives a report hard-delete).
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    op: text("op").notNull(), // 'created' | 'updated' | 'deleted' (text, not enum)
    reportId: uuid("report_id").notNull(),
    // (company, role, level) cell, denormalized so the consumer needs no join.
    companyId: uuid("company_id").notNull(),
    canonicalRoleId: uuid("canonical_role_id").notNull(),
    level: text("level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    aggregateProcessedAt: timestamp("aggregate_processed_at", {
      withTimezone: true,
    }),
    searchProcessedAt: timestamp("search_processed_at", { withTimezone: true }),
    karmaProcessedAt: timestamp("karma_processed_at", { withTimezone: true }),
  },
  (t) => [
    // Partial indexes covering only each consumer's unprocessed tail.
    index("events_aggregate_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.aggregateProcessedAt} IS NULL`),
    index("events_search_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.searchProcessedAt} IS NULL`),
    index("events_karma_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.karmaProcessedAt} IS NULL`),
  ],
);

export type ReportEventRow = typeof events.$inferSelect;
export type NewReportEvent = typeof events.$inferInsert;
