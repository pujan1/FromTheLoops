import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// `analytics_events` — the ADR-0010 instrumentation sink.
//
// Deliberately NOT the `events` table next door: that one is the report
// transactional outbox (created/updated/deleted) that the worker's aggregate /
// search / karma consumers drain. This is product-analytics telemetry — the
// triage peek_open / peek_step / open_full / peek_dwell stream the ADR needs to
// learn whether the preview pane earns its complexity (device split, triage-vs-
// consume-all). Mixing the two would feed garbage to those consumers.
//
// Append-only, no FKs, no per-consumer markers: nothing drains this live. It's a
// query-it-with-SQL log. The event vocabulary stays a closed set in
// apps/web/lib/track.ts (TrackEvent); `name` is plain text here so a new event
// kind never needs a type-altering migration. Everything event-specific (the
// report id, `surface: pane|sheet`, dwell `ms`, originating `path`) rides in the
// `props` jsonb, so the schema never changes as the vocabulary grows.
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    props: jsonb("props").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // The natural query is "events of kind X over a time window" (funnels, daily
  // counts). One composite index on (name, created_at) serves it.
  (t) => [index("analytics_events_name_created_idx").on(t.name, t.createdAt)],
);

export type AnalyticsEventRow = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
