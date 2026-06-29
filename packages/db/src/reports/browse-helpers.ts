// Shared SQL fragments + WHERE builders so every list read and its ordered-ID
// provider agree on what "visible + filtered" means.

import { sql, type SQL } from "drizzle-orm";
import type { RoleCellKey } from "../pipeline/aggregates.js";
import type { CellReportFilters } from "./browse-types.js";

// Visibility filter, identical to the aggregate + search pipelines.
export const VISIBLE = [sql`r.status = 'active'`, sql`r.deleted_at IS NULL`];

// Per-report helpful signal. score = sum of each valid flagger's karma
// (GREATEST(.,1)); weighted by the flagger, never the submitter. Self-flags and
// unverified flaggers excluded, matching the karma earn rule.
export const HELPFUL_FLAG_LATERAL = sql`
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(GREATEST(fu.karma, 1)), 0)::int AS score
    FROM helpful_flags hf
    JOIN users fu ON fu.id = hf.flagger_user_id
    WHERE hf.report_id = r.id
      AND fu.id <> r.created_by_user_id
      AND EXISTS (
        SELECT 1 FROM user_verifications v WHERE v.user_id = hf.flagger_user_id
      )
  ) hflag ON true`;

// Helpful signal first, recency tiebreak. Unflagged reports score 0 → newest-first.
export const REPORT_LIST_ORDER = sql`ORDER BY hflag.score DESC, r.created_at DESC`;

// Facet filters. Topic/round-type are EXISTS so a report counts once however
// many rounds/questions match.
export function reportFilterConditions(filters?: CellReportFilters): SQL[] {
  const conditions: SQL[] = [];
  if (!filters) return conditions;
  if (filters.outcome) conditions.push(sql`r.outcome = ${filters.outcome}`);
  if (filters.level) conditions.push(sql`r.level = ${filters.level}`);
  if (filters.verifiedOnly) conditions.push(sql`r.evidence_verified = true`);
  if (filters.roundType) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM rounds rd
      WHERE rd.report_id = r.id AND rd.round_type = ${filters.roundType}
    )`);
  }
  if (filters.topics && filters.topics.length > 0) {
    // IN-list, not `= ANY($arr)`: drizzle binds a JS array as a scalar.
    const slugList = sql.join(
      filters.topics.map((slug) => sql`${slug}`),
      sql`, `,
    );
    conditions.push(sql`EXISTS (
      SELECT 1 FROM rounds rd
      JOIN questions q ON q.round_id = rd.id
      JOIN question_topics qt ON qt.question_id = q.id
      JOIN topics t ON t.id = qt.topic_id
      WHERE rd.report_id = r.id AND t.slug IN (${slugList})
    )`);
  }
  return conditions;
}

// (company, role) scope + filter WHERE.
export function roleReportWhere(cell: RoleCellKey, filters?: CellReportFilters): SQL {
  return sql.join(
    [
      sql`r.company_id = ${cell.companyId}::uuid`,
      sql`r.canonical_role_id = ${cell.canonicalRoleId}::uuid`,
      ...VISIBLE,
      ...reportFilterConditions(filters),
    ],
    sql` AND `,
  );
}

// Profile scope + filter WHERE. The display_attribution predicate IS the
// privacy boundary — anonymous reports are absent.
export function userReportWhere(userId: string, filters?: CellReportFilters): SQL {
  return sql.join(
    [
      sql`r.created_by_user_id = ${userId}::uuid`,
      sql`r.display_attribution = 'display_name'`,
      ...VISIBLE,
      ...reportFilterConditions(filters),
    ],
    sql` AND `,
  );
}

// Global feed scope + filter WHERE (every visible report, no company/role/user
// scope). Backs the /reports index.
export function globalReportWhere(filters?: CellReportFilters): SQL {
  return sql.join([...VISIBLE, ...reportFilterConditions(filters)], sql` AND `);
}

// Company-feed scope + filter WHERE (all roles at one company).
export function companyReportWhere(companyId: string, filters?: CellReportFilters): SQL {
  return sql.join(
    [
      sql`r.company_id = ${companyId}::uuid`,
      ...VISIBLE,
      ...reportFilterConditions(filters),
    ],
    sql` AND `,
  );
}
