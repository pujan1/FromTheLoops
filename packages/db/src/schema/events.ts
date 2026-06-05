import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// `events` — the internal event log / transactional outbox (Sprint 3).
//
// Every report write (create / edit / soft-delete) inserts a row here inside
// the SAME transaction as the report change (see reports.ts). That atomicity is
// the whole point: if the report commits, the event is durably recorded; if the
// report rolls back, no event is left behind. An AFTER INSERT trigger
// (migration 0010) fires pg_notify('events', id) so a listening worker wakes
// within milliseconds — but the row is the source of truth, and a fallback
// poller sweeps any events a dropped NOTIFY missed.
//
// Two independent consumers fan out from one event, each retried on its own
// (PLAN/sprint risk table): the aggregate refresh (Day 4) and the Typesense
// indexer (Day 6). They track their own progress via separate *_processed_at
// columns so a Typesense outage can't stall aggregate refreshes and vice-versa.
// An event is fully drained once both are non-null.
//
// No FKs: this is an append-only log that must survive even a report hard-delete
// (the cell columns are denormalized onto the row precisely so a delete event
// can still name the cell to refresh without joining back to a gone row).
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // The report action this event records. Plain text, not an enum: an event
    // log should take new kinds without a type-altering migration.
    // One of 'created' | 'updated' | 'deleted'.
    op: text("op").notNull(),
    reportId: uuid("report_id").notNull(),
    // The (company, role, level) cell this report belongs to — the unit the
    // aggregate refreshes. Denormalized so the consumer needs no join.
    companyId: uuid("company_id").notNull(),
    canonicalRoleId: uuid("canonical_role_id").notNull(),
    level: text("level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Per-consumer drain markers. Null = that consumer hasn't handled it yet;
    // its fallback poller scans for nulls. Day 6 wires search_processed_at.
    aggregateProcessedAt: timestamp("aggregate_processed_at", {
      withTimezone: true,
    }),
    searchProcessedAt: timestamp("search_processed_at", { withTimezone: true }),
  },
  (t) => [
    // Partial indexes that keep each consumer's "what's still pending?" sweep
    // cheap — they only cover the unprocessed tail, not the whole growing log.
    index("events_aggregate_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.aggregateProcessedAt} IS NULL`),
    index("events_search_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.searchProcessedAt} IS NULL`),
  ],
);

export type ReportEventRow = typeof events.$inferSelect;
export type NewReportEvent = typeof events.$inferInsert;
