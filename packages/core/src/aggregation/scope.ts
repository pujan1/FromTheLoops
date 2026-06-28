// Pure sparse-data fallback decision. A thin cell broadens up a ladder
// (exact → role → tag) so its aggregate doesn't mislead ("100% offer off 2
// reports"). No DB/IO.

export const SPARSE_REPORT_THRESHOLD = 10;

export type AggregateScope = "exact" | "role" | "tag";

// Widest-inclusive: role >= exact always. tag is the always-available floor.
export interface ScopeReportCounts {
  exact: number;
  role: number;
  tag: number;
}

export interface ScopeDecision {
  scope: AggregateScope;
  count: number; // backs the "based on N reports" copy
  broadened: boolean;
}

// Narrowest scope clearing the threshold; else fall back to tag-level.
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

// Level view: stand alone or broaden to the role aggregate (single rung; the
// role page is always the floor).

export type LevelView = "level" | "role";

export interface LevelViewDecision {
  view: LevelView;
  broadened: boolean; // fell back to role → sparse banner + canonicalize up
}

// `levelCount` is the exact level cell's count (0 for the sentinel level).
export function decideLevelView(
  levelCount: number,
  threshold: number = SPARSE_REPORT_THRESHOLD,
): LevelViewDecision {
  if (levelCount >= threshold) return { view: "level", broadened: false };
  return { view: "role", broadened: true };
}

// Topic×company leaf: stand alone or broaden to the topic across all companies
// (same single-rung shape as decideLevelView).

export type TopicCompanyView = "company" | "topic";

export interface TopicCompanyViewDecision {
  view: TopicCompanyView;
  broadened: boolean; // broadened to topic → sparse banner + canonicalize up
}

// `companyReportCount` is distinct visible reports at the company touching the topic.
export function decideTopicCompanyView(
  companyReportCount: number,
  threshold: number = SPARSE_REPORT_THRESHOLD,
): TopicCompanyViewDecision {
  if (companyReportCount >= threshold) {
    return { view: "company", broadened: false };
  }
  return { view: "topic", broadened: true };
}
