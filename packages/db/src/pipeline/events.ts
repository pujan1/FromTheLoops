// Event outbox: producers (reports.ts) emit inside their tx; the aggregate,
// search, and karma consumers drain via NOTIFY + a fallback poller over the
// *_processed_at markers.

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { events, type ReportEventRow } from "../schema/events.js";
import type { Db, Tx } from "../lib/types.js";

// LISTEN/NOTIFY channel the trigger publishes to; payload is the event id.
export const EVENTS_CHANNEL = "events";

export type EventOp = "created" | "updated" | "deleted";

export interface EmitReportEventInput {
  op: EventOp;
  reportId: string;
  companyId: string;
  canonicalRoleId: string;
  level: string;
}

// Must run inside the same tx as the report write so the two commit atomically.
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

// Oldest-first events the aggregate consumer hasn't drained, capped.
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

// Guarded on still-null so a concurrent double-process is a no-op.
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

// Aggregation lag for /admin/health.
export async function countUnprocessedAggregateEvents(db: Db): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM events WHERE aggregate_processed_at IS NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}

// search consumer — mirror of the aggregate trio, against search_processed_at.
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

// Search-index lag for /admin/health.
export async function countUnprocessedSearchEvents(db: Db): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM events WHERE search_processed_at IS NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}

// karma consumer — mirror, against karma_processed_at.
export async function claimUnprocessedKarmaEvents(
  db: Db,
  limit = 100,
): Promise<ReportEventRow[]> {
  return db
    .select()
    .from(events)
    .where(isNull(events.karmaProcessedAt))
    .orderBy(asc(events.createdAt))
    .limit(limit);
}

export async function markKarmaEventProcessed(
  db: Db,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(events)
    .set({ karmaProcessedAt: new Date() })
    .where(and(eq(events.id, id), isNull(events.karmaProcessedAt)))
    .returning({ id: events.id });
  return rows.length > 0;
}

// Karma-recompute lag for /admin/health.
export async function countUnprocessedKarmaEvents(db: Db): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM events WHERE karma_processed_at IS NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}
