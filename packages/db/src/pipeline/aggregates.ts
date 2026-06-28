// Thin typed surface over the aggregate summary tables + refresh functions
// (defined in SQL, migration 0008). Used by the worker, backfill, and wedge page.

import { sql } from "drizzle-orm";
import {
  getEventById,
  markAggregateEventProcessed,
} from "./events.js";
import type { Db } from "../lib/types.js";

// Mirrors the SQL report_trust_weight() so JS callers can re-derive without a
// round-trip. V1 wires only the verified tier.
export const REPORT_TRUST_WEIGHTS = {
  verified: 1.0,
  unverified: 0.3,
} as const;

export function reportTrustWeight(evidenceVerified: boolean): number {
  return evidenceVerified
    ? REPORT_TRUST_WEIGHTS.verified
    : REPORT_TRUST_WEIGHTS.unverified;
}

export interface AggregateTopTopic {
  topic_id: string;
  slug: string;
  name: string;
  count: number;
  weighted_count: number;
}

// Grain-agnostic payload shared by level- and role-grain aggregates. NUMERIC
// columns arrive as strings and are normalized to numbers here.
export interface AggregateInsights {
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

export interface CompanyRoleLevelAggregate extends AggregateInsights {
  companyId: string;
  canonicalRoleId: string;
  level: string;
}

// Role-grain aggregate, spanning every level. Same shape minus the level.
export interface CompanyRoleAggregate extends AggregateInsights {
  companyId: string;
  canonicalRoleId: string;
}

export interface AggregateCellKey {
  companyId: string;
  canonicalRoleId: string;
  level: string;
}

export interface RoleCellKey {
  companyId: string;
  canonicalRoleId: string;
}

// Recompute + UPSERT one cell. Idempotent; drops the row if it has no live reports.
export async function refreshAggregateCell(
  db: Db,
  cell: AggregateCellKey,
): Promise<void> {
  await db.execute(
    sql`SELECT refresh_aggregate_cell(${cell.companyId}::uuid, ${cell.canonicalRoleId}::uuid, ${cell.level})`,
  );
}

// Per-event handler for the refresh-aggregate worker job. Idempotent (missing
// or already-processed → clean no-op).
export type RefreshEventResult = "missing" | "refreshed";

export async function refreshAggregateForEvent(
  db: Db,
  eventId: string,
): Promise<RefreshEventResult> {
  const event = await getEventById(db, eventId);
  if (!event) return "missing";
  // A write moves both grains: the level cell and the role cell above it.
  await refreshAggregateCell(db, {
    companyId: event.companyId,
    canonicalRoleId: event.canonicalRoleId,
    level: event.level,
  });
  await refreshRoleAggregate(db, {
    companyId: event.companyId,
    canonicalRoleId: event.canonicalRoleId,
  });
  await markAggregateEventProcessed(db, eventId);
  return "refreshed";
}

// Role-grain analogue of refreshAggregateCell. Idempotent.
export async function refreshRoleAggregate(
  db: Db,
  cell: RoleCellKey,
): Promise<void> {
  await db.execute(
    sql`SELECT refresh_aggregate_role(${cell.companyId}::uuid, ${cell.canonicalRoleId}::uuid)`,
  );
}

// Full backfill / reconciliation. Returns the number of cells refreshed.
export async function refreshAllAggregates(db: Db): Promise<number> {
  const rows = await db.execute<{ refresh_all_aggregates: number }>(
    sql`SELECT refresh_all_aggregates() AS refresh_all_aggregates`,
  );
  return Number(rows[0]?.refresh_all_aggregates ?? 0);
}

// The wedge page's primary read. null if never refreshed / no live reports.
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

// Role page's primary read (spans every level). null if no live reports.
export async function getRoleAggregate(
  db: Db,
  cell: RoleCellKey,
): Promise<CompanyRoleAggregate | null> {
  const rows = await db.execute<Omit<AggregateRow, "level">>(sql`
    SELECT company_id, canonical_role_id, report_count,
           outcome_offer, outcome_reject, outcome_withdrew, outcome_ghosted, outcome_pending,
           trust_weighted_count, median_round_count, mode_round_sequence, top_topics, refreshed_at
    FROM aggregates_company_role
    WHERE company_id = ${cell.companyId}::uuid
      AND canonical_role_id = ${cell.canonicalRoleId}::uuid
  `);
  const row = rows[0];
  return row
    ? { companyId: row.company_id, canonicalRoleId: row.canonical_role_id, ...mapInsights(row) }
    : null;
}

// Raw postgres-js row shape. Type alias so it satisfies db.execute's index sig.
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

function mapInsights(row: Omit<AggregateRow, "level">): AggregateInsights {
  return {
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

function mapAggregateRow(row: AggregateRow): CompanyRoleLevelAggregate {
  return {
    companyId: row.company_id,
    canonicalRoleId: row.canonical_role_id,
    level: row.level,
    ...mapInsights(row),
  };
}

// Hand-DDL'd in migration 0008, not declared in schema/*.ts.
export const aggregatesTableName = "aggregates_company_role_level";

export interface AggregateCellHealth {
  companyName: string;
  roleName: string;
  level: string;
  reportCount: number;
  refreshedAt: Date;
}

// Most-recently-refreshed cells first, capped.
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

export async function countAggregateCells(db: Db): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM aggregates_company_role_level`,
  );
  return Number(rows[0]?.n ?? 0);
}
