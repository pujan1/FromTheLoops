// Event outbox data-access (Sprint 3 Day 3).
//
// Producers: the report write functions in reports.ts call emitReportEvent
// inside their transaction. Consumers: the worker's refresh-aggregate job (Day
// 4) and Typesense indexer (Day 6) drain events — both via the live NOTIFY fast
// path (LISTEN on EVENTS_CHANNEL) and a fallback poller over the *_processed_at
// markers. See schema/events.ts for the why.
//
// Pure persistence, like reports.ts: no shared/core dep.

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { events, type ReportEventRow } from "./schema/events.js";
import * as schema from "./schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The Postgres LISTEN/NOTIFY channel the trigger (migration 0010) publishes to.
// Worker LISTENs here; payload is the event id.
export const EVENTS_CHANNEL = "events";

// The report action an event records. The aggregate consumer treats all three
// the same (recompute the cell); the search consumer (Day 6) cares: delete →
// drop the doc, created/updated → upsert it.
export type EventOp = "created" | "updated" | "deleted";

export interface EmitReportEventInput {
  op: EventOp;
  reportId: string;
  companyId: string;
  canonicalRoleId: string;
  level: string;
}

// Insert an event row on the caller's transaction. MUST be called inside the
// same tx as the report write so the two commit atomically (the trigger's
// pg_notify then fires on that commit). Returns the new event id.
export async function emitReportEvent(
  tx: Tx,
  input: EmitReportEventInput,
): Promise<string> {
  const rows = await tx
    .insert(events)
    .values({
      op: input.op,
      reportId: input.reportId,
      companyId: input.companyId,
      canonicalRoleId: input.canonicalRoleId,
      level: input.level,
    })
    .returning({ id: events.id });
  return rows[0]!.id;
}

export async function getEventById(
  db: Db,
  id: string,
): Promise<ReportEventRow | null> {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] ?? null;
}

// The fallback poller's read: oldest-first events the AGGREGATE consumer hasn't
// drained yet. Capped so one sweep can't unbounded-load a huge backlog.
export async function claimUnprocessedAggregateEvents(
  db: Db,
  limit = 100,
): Promise<ReportEventRow[]> {
  return db
    .select()
    .from(events)
    .where(isNull(events.aggregateProcessedAt))
    .orderBy(asc(events.createdAt))
    .limit(limit);
}

// Mark an event drained by the aggregate consumer. Guarded on still-null so a
// concurrent double-process is a harmless no-op. Returns true if it flipped.
export async function markAggregateEventProcessed(
  db: Db,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(events)
    .set({ aggregateProcessedAt: new Date() })
    .where(and(eq(events.id, id), isNull(events.aggregateProcessedAt)))
    .returning({ id: events.id });
  return rows.length > 0;
}

// Aggregation lag for /admin/health (Day 8): how many events the aggregate
// consumer still owes. A healthy worker keeps this near zero.
export async function countUnprocessedAggregateEvents(db: Db): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM events WHERE aggregate_processed_at IS NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}

// ── search consumer (Day 6) ─────────────────────────────────────────────────
// The exact mirror of the aggregate trio above, against the independent
// search_processed_at marker. The two consumers drain the same event log on
// their own clocks (sprint risk table: "both retried independently") — a
// Typesense outage stalls only search, never the aggregate refresh.

// The fallback poller's read for the SEARCH consumer: oldest-first events it
// hasn't drained. Rides the events_search_pending_idx partial index.
export async function claimUnprocessedSearchEvents(
  db: Db,
  limit = 100,
): Promise<ReportEventRow[]> {
  return db
    .select()
    .from(events)
    .where(isNull(events.searchProcessedAt))
    .orderBy(asc(events.createdAt))
    .limit(limit);
}

// Mark an event drained by the search consumer. Guarded on still-null so a
// concurrent double-process is a harmless no-op. Returns true if it flipped.
export async function markSearchEventProcessed(
  db: Db,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(events)
    .set({ searchProcessedAt: new Date() })
    .where(and(eq(events.id, id), isNull(events.searchProcessedAt)))
    .returning({ id: events.id });
  return rows.length > 0;
}

// Search-index lag for /admin/health (Day 8): how many events the search
// consumer still owes.
export async function countUnprocessedSearchEvents(db: Db): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM events WHERE search_processed_at IS NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}
