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

// ---------------------------------------------------------------------------
// Level-view decision (Sprint 4 role-primary amendment).
//
// In the role-primary model the ROLE page is the canonical aggregated unit; a
// LEVEL view (/companies/c/r/l, or the role page with ?level=) is secondary. So
// the broaden ladder collapses to a single rung: a level view either stands on
// its own (the level cell cleared the threshold) or it broadens to the role
// aggregate. There is no `tag` fallback here — the role grain is always the
// floor, and the role page itself never broadens (it IS the corpus).
// ---------------------------------------------------------------------------

export type LevelView = "level" | "role";

export interface LevelViewDecision {
  // Which precomputed aggregate Position Y should show.
  view: LevelView;
  // True when we fell back to the role aggregate — the level view then shows a
  // sparse banner and canonicalizes UP to the role page (thin near-duplicate
  // level pages shouldn't compete for index space). False → the level page is
  // dense enough to render + self-canonicalize.
  broadened: boolean;
}

// Decide whether a level view renders its own cell or broadens to the role.
// `levelCount` is the exact level cell's report count (0 when it has no cell,
// e.g. the sentinel/Unspecified level). Dense → stand alone; else broaden.
export function decideLevelView(
  levelCount: number,
  threshold: number = SPARSE_REPORT_THRESHOLD,
): LevelViewDecision {
  if (levelCount >= threshold) return { view: "level", broadened: false };
  return { view: "role", broadened: true };
}

// ---------------------------------------------------------------------------
// Topic×company view decision (Sprint 5). The /topics/[topic]/[company] leaf is
// the topic analogue of the wedge: a thin per-company cell shouldn't masquerade
// as a confident signal, so when it's sparse the page broadens to the topic
// across ALL companies (+ a banner) and canonicalizes UP to /topics/[topic]
// (thin near-duplicate company leaves shouldn't compete for index space). Same
// single-rung shape as decideLevelView — stand alone, or broaden to the parent.
// ---------------------------------------------------------------------------

export type TopicCompanyView = "company" | "topic";

export interface TopicCompanyViewDecision {
  // Which corpus the question list shows: just this company, or the topic
  // across every company.
  view: TopicCompanyView;
  // True when we broadened to the topic — the page shows a sparse banner and
  // canonicalizes up to /topics/[topic].
  broadened: boolean;
}

// `companyReportCount` is the distinct VISIBLE reports at the company whose
// questions carry the topic. Dense → the company-filtered view; else broaden to
// the topic across all companies.
export function decideTopicCompanyView(
  companyReportCount: number,
  threshold: number = SPARSE_REPORT_THRESHOLD,
): TopicCompanyViewDecision {
  if (companyReportCount >= threshold) {
    return { view: "company", broadened: false };
  }
  return { view: "topic", broadened: true };
}
