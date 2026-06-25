// Shared SQL fragments + WHERE builders for the browse report-list reads. Pulled
// out of browse.ts so the visibility/scope/filter composition that every list
// read AND its ordered-ID provider share lives in one place — the two can never
// disagree on what "visible + filtered" means.

import { sql, type SQL } from "drizzle-orm";
import type { RoleCellKey } from "../pipeline/aggregates.js";
import type { CellReportFilters } from "./browse-types.js";

// The visibility filter, IDENTICAL to the aggregate + search pipelines — a
// pending/deleted report can never surface on a public page.
export const VISIBLE = [sql`r.status = 'active'`, sql`r.deleted_at IS NULL`];

// Helpful-flag signal per report (PLAN.md §Karma "helpful-flag-weighted
// aggregation ranking"), shared verbatim by the paginated list read and the
// ordered-ID provider so the two can NEVER disagree on ordering. cnt = how many
// readers flagged it (display); score = karma-weighted sum, weighting each VALID
// flag by the FLAGGER's karma (GREATEST(.,1) so every flag counts ≥1 and a
// heavier flagger lifts more). We weight by the flagger, never the submitter —
// "no submitter-rank boost" (the rich-get-richer trap PLAN.md avoids). Self-flags
// and unverified flaggers are excluded, matching the karma earn rule.
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

// Karma-weighted helpful signal first, recency as the tiebreak. Unflagged
// reports all score 0, so they keep newest-first order — the signal only lifts
// reports readers have endorsed. Consumed by both reads below.
export const REPORT_LIST_ORDER = sql`ORDER BY hflag.score DESC, r.created_at DESC`;

// The optional, facet-driven WHERE clauses shared by every report-list read
// (cell / role / company). The scope clauses (company/role/level) are the
// caller's; these are the user-toggled filters. Topic / round-type filters are
// EXISTS sub-selects so a report is counted once however many of its
// rounds/questions match. Returns the extra conditions to AND onto the scope.
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
    // IN-list (one bound param per slug) rather than `= ANY($arr)` — drizzle's
    // sql template binds a JS array as a scalar, which postgres rejects as a
    // malformed array literal.
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

// The (company, role) scope + filter WHERE, shared by the paginated list read
// and the ordered-ID provider so the pane walks the SAME set the list paginates.
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

// The profile scope + filter WHERE, shared by the paginated list and the
// ordered-ID provider (so the pane walks the SAME attributed set). The
// display_attribution='display_name' predicate IS the privacy boundary — an
// anonymously-posted report is absent from both reads identically.
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

// The company-feed scope + filter WHERE (all roles at one company), shared by the
// paginated list and the ordered-ID provider so the pane walks the SAME set.
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
