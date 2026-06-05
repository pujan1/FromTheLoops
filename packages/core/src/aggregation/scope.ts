// Sparse-data fallback (Sprint 3 Day 7). The canonical wedge page is one
// (company, role, level) cell. When that cell is thin, rendering its raw
// aggregate would be misleading ("100% offer rate" off two reports), so the page
// BROADENS to a wider corpus and shows a banner saying so.
//
// PLAN.md §V1 scope: "broaden scope with banner + tag-level aggregation when <10
// reports per cell". The broadening ladder, narrowest → widest:
//
//   exact — the (company, role, level) cell itself. Enough reports to stand on
//           its own; render it directly, no banner.
//   role  — same company + role, ALL levels merged (drop the level axis). The
//           first broaden: "Not enough L5 reports yet — showing all Google SWE."
//   tag   — the deepest fallback: lean on topic-tag aggregation (the /topics
//           corpus) rather than this company's role at all, so the page is never
//           empty. "Few reports here — showing what topics come up for this role."
//
// This module is a PURE decision function — it takes the report counts the
// caller already has (from getAggregate / a count query per scope) and returns
// which scope to render. No DB, no IO; trivially unit-testable, which is the
// whole point of isolating it here (Sprint 3 deliverable + exit criterion).

// The volume below which a cell is "sparse" and we broaden. PLAN.md fixes this
// at 10: a cell needs ≥10 reports to render as 'exact'.
export const SPARSE_REPORT_THRESHOLD = 10;

export type AggregateScope = "exact" | "role" | "tag";

// Report counts at each candidate scope, widest-inclusive: `role` counts every
// report in `exact` plus the other levels, so role >= exact always holds. `tag`
// is the always-available fallback corpus (a count is carried for the banner /
// "based on N" copy, but it never gates — it's the floor).
export interface ScopeReportCounts {
  exact: number;
  role: number;
  tag: number;
}

export interface ScopeDecision {
  scope: AggregateScope;
  // Reports backing the chosen scope — drives the "based on N reports" copy.
  count: number;
  // True whenever we fell back past 'exact' (the page shows a broaden banner).
  broadened: boolean;
}

// Pick the narrowest scope whose corpus clears the threshold; if even the
// company+role corpus is thin, fall all the way back to tag-level aggregation.
//
// Exit criterion: 'exact' when the cell has ≥10 reports, a broadened scope when
// it has <10.
export function decideScope(
  counts: ScopeReportCounts,
  threshold: number = SPARSE_REPORT_THRESHOLD,
): ScopeDecision {
  if (counts.exact >= threshold) {
    return { scope: "exact", count: counts.exact, broadened: false };
  }
  if (counts.role >= threshold) {
    return { scope: "role", count: counts.role, broadened: true };
  }
  return { scope: "tag", count: counts.tag, broadened: true };
}
