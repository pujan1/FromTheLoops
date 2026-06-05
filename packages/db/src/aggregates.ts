// Aggregation read/refresh data-access (Sprint 3).
//
// The heavy lifting lives in SQL: migration 0008 creates the
// `aggregates_company_role_level` summary table plus the refresh_aggregate_cell
// / refresh_all_aggregates functions (see views/aggregates_company_role_level.sql
// for the annotated source + the why-a-table-not-a-matview rationale). This
// module is the thin typed surface the worker (refresh-aggregate job, Day 4) and
// the backfill script (Day 6) call, plus the read the Sprint 4 wedge page uses.
//
// Pure persistence, like reports.ts: no @fromtheloop/shared or /core dep.

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  getEventById,
  markAggregateEventProcessed,
} from "./events.js";
import * as schema from "./schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;

// The trust-tier → weight mapping, mirrored from the SQL report_trust_weight()
// (migration 0008) so JS callers can reason about / re-derive a weight without a
// round-trip. PLAN.md §Aggregation weighting; V1 only wires the verified-employee
// (evidence_verified) tier, so the live mapping collapses to these two.
export const REPORT_TRUST_WEIGHTS = {
  verified: 1.0,
  unverified: 0.3,
} as const;

export function reportTrustWeight(evidenceVerified: boolean): number {
  return evidenceVerified
    ? REPORT_TRUST_WEIGHTS.verified
    : REPORT_TRUST_WEIGHTS.unverified;
}

// One entry in a cell's top_topics jsonb array.
export interface AggregateTopTopic {
  topic_id: string;
  slug: string;
  name: string;
  count: number;
  weighted_count: number;
}

// A single (company, role, level) aggregate row, shaped for app reads. Numeric
// columns come back as strings over the wire (postgres NUMERIC → string), so we
// normalize them to numbers here.
export interface CompanyRoleLevelAggregate {
  companyId: string;
  canonicalRoleId: string;
  level: string;
  reportCount: number;
  outcome: {
    offer: number;
    reject: number;
    withdrew: number;
    ghosted: number;
    pending: number;
  };
  trustWeightedCount: number;
  medianRoundCount: number | null;
  modeRoundSequence: string[] | null;
  topTopics: AggregateTopTopic[];
  refreshedAt: Date;
}

// The key identifying one cell / "partition".
export interface AggregateCellKey {
  companyId: string;
  canonicalRoleId: string;
  level: string;
}

// Recompute and UPSERT a single cell. This is what the worker calls per
// LISTEN/NOTIFY event so only the affected partition is touched. Idempotent;
// removes the row if the cell has no live reports left.
export async function refreshAggregateCell(
  db: Db,
  cell: AggregateCellKey,
): Promise<void> {
  await db.execute(
    sql`SELECT refresh_aggregate_cell(${cell.companyId}::uuid, ${cell.canonicalRoleId}::uuid, ${cell.level})`,
  );
}

// The aggregate consumer's per-event handler — the testable core of the
// refresh-aggregate worker job (Day 4). Loads the event, recomputes its cell,
// and marks the event drained by the aggregate consumer. Idempotent: a missing
// or already-processed event is a clean no-op, so BullMQ retries and the
// fallback poller can both deliver the same event safely.
export type RefreshEventResult = "missing" | "refreshed";

export async function refreshAggregateForEvent(
  db: Db,
  eventId: string,
): Promise<RefreshEventResult> {
  const event = await getEventById(db, eventId);
  if (!event) return "missing";
  await refreshAggregateCell(db, {
    companyId: event.companyId,
    canonicalRoleId: event.canonicalRoleId,
    level: event.level,
  });
  await markAggregateEventProcessed(db, eventId);
  return "refreshed";
}

// Full backfill / reconciliation. Returns the number of cells refreshed.
export async function refreshAllAggregates(db: Db): Promise<number> {
  const rows = await db.execute<{ refresh_all_aggregates: number }>(
    sql`SELECT refresh_all_aggregates() AS refresh_all_aggregates`,
  );
  return Number(rows[0]?.refresh_all_aggregates ?? 0);
}

// Read one cell's aggregate, or null if it has never been refreshed / has no
// live reports. The Sprint 4 wedge page's primary read.
export async function getAggregate(
  db: Db,
  cell: AggregateCellKey,
): Promise<CompanyRoleLevelAggregate | null> {
  const rows = await db.execute<AggregateRow>(sql`
    SELECT company_id, canonical_role_id, level, report_count,
           outcome_offer, outcome_reject, outcome_withdrew, outcome_ghosted, outcome_pending,
           trust_weighted_count, median_round_count, mode_round_sequence, top_topics, refreshed_at
    FROM aggregates_company_role_level
    WHERE company_id = ${cell.companyId}::uuid
      AND canonical_role_id = ${cell.canonicalRoleId}::uuid
      AND level = ${cell.level}
  `);
  const row = rows[0];
  return row ? mapAggregateRow(row) : null;
}

// Raw row shape as it comes back from postgres-js (NUMERIC → string, jsonb →
// already-parsed object/array, text[] → string[]).
// Type alias (not interface) so it satisfies db.execute's
// Record<string, unknown> constraint.
type AggregateRow = {
  company_id: string;
  canonical_role_id: string;
  level: string;
  report_count: number;
  outcome_offer: number;
  outcome_reject: number;
  outcome_withdrew: number;
  outcome_ghosted: number;
  outcome_pending: number;
  trust_weighted_count: string;
  median_round_count: string | null;
  mode_round_sequence: string[] | null;
  top_topics: AggregateTopTopic[];
  refreshed_at: string | Date;
};

function mapAggregateRow(row: AggregateRow): CompanyRoleLevelAggregate {
  return {
    companyId: row.company_id,
    canonicalRoleId: row.canonical_role_id,
    level: row.level,
    reportCount: Number(row.report_count),
    outcome: {
      offer: Number(row.outcome_offer),
      reject: Number(row.outcome_reject),
      withdrew: Number(row.outcome_withdrew),
      ghosted: Number(row.outcome_ghosted),
      pending: Number(row.outcome_pending),
    },
    trustWeightedCount: Number(row.trust_weighted_count),
    medianRoundCount:
      row.median_round_count === null ? null : Number(row.median_round_count),
    modeRoundSequence: row.mode_round_sequence,
    topTopics: (row.top_topics ?? []).map((t) => ({
      topic_id: t.topic_id,
      slug: t.slug,
      name: t.name,
      count: Number(t.count),
      weighted_count: Number(t.weighted_count),
    })),
    refreshedAt: new Date(row.refreshed_at),
  };
}

// The table name, for callers doing ad-hoc reads (e.g. /admin/health's
// last-refresh-per-cell query, Day 8). The table is hand-DDL'd in migration
// 0008, not declared in schema/*.ts.
export const aggregatesTableName = "aggregates_company_role_level";

// One cell's freshness, for /admin/health (Day 8). Joined to company/role names
// so the page reads "Google · Software Engineer · L5 — 12 reports, 3m ago".
export interface AggregateCellHealth {
  companyName: string;
  roleName: string;
  level: string;
  reportCount: number;
  refreshedAt: Date;
}

// Most-recently-refreshed cells first. Capped — the health page only needs a
// glanceable sample, not the whole table.
export async function listRecentAggregateRefreshes(
  db: Db,
  limit = 20,
): Promise<AggregateCellHealth[]> {
  const rows = await db.execute<{
    company_name: string;
    role_name: string;
    level: string;
    report_count: number;
    refreshed_at: string | Date;
  }>(sql`
    SELECT c.name AS company_name, ro.name AS role_name, a.level,
           a.report_count, a.refreshed_at
    FROM aggregates_company_role_level a
    JOIN companies c ON c.id = a.company_id
    JOIN roles ro ON ro.id = a.canonical_role_id
    ORDER BY a.refreshed_at DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    companyName: r.company_name,
    roleName: r.role_name,
    level: r.level,
    reportCount: Number(r.report_count),
    refreshedAt: new Date(r.refreshed_at),
  }));
}

// Total live cells in the aggregate table — a one-number "how much has been
// aggregated" for the health page header.
export async function countAggregateCells(db: Db): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM aggregates_company_role_level`,
  );
  return Number(rows[0]?.n ?? 0);
}
