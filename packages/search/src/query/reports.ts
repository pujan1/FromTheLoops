// reports query — the read side of the `reports` collection. The wedge/search
// UI (apps/web, Sprint 4) calls this; it's the only place a Typesense *search*
// (as opposed to index write) is shaped, so the query_by / filter_by / sort
// contract lives in one spot, in lockstep with schemas/reports.ts.
//
// Source of truth stays Postgres; this returns just enough of each doc to render
// a result card without a Postgres round-trip (id → routes.report(id), names,
// facets, the highlighted snippet). The caller hydrates nothing.

import type { Client } from "typesense";
import { REPORTS_COLLECTION } from "../schemas/reports.js";
import { getSearchClient } from "../client.js";

// The facet constraints a search can carry, all optional (absent = no
// constraint). Kept as a plain interface — the search package depends on db,
// not shared, so we don't pull the shared enum types here; callers pass strings.
export interface ReportSearchFilters {
  outcome?: string;
  roundType?: string;
  // Topic slugs — a report matches if it carries ANY (OR within the facet).
  topics?: string[];
  // "verified" restricts to evidence-verified reports; anything else is no
  // constraint.
  verifiedOnly?: boolean;
}

export interface ReportSearchParams {
  // Free-text query. Empty/blank → match-all, newest-first (a bare /search).
  q: string;
  filters?: ReportSearchFilters;
  page: number;
  perPage: number;
}

// One result row — the doc fields the result card needs plus the highlighted
// snippet Typesense computed over `text`.
export interface ReportSearchHit {
  id: string;
  companySlug: string;
  companyName: string;
  roleSlug: string;
  roleName: string;
  level: string;
  outcome: string | null;
  roundTypes: string[];
  roundCount: number;
  topicSlugs: string[];
  topicNames: string[];
  verified: boolean;
  interviewMonth: string;
  // The matched fragment of the body, with <mark> around the hit; null when the
  // query was match-all (nothing to highlight).
  snippet: string | null;
}

export interface ReportSearchResult {
  hits: ReportSearchHit[];
  // Total docs matching the query+filters (across all pages).
  found: number;
  page: number;
  perPage: number;
  searchTimeMs: number;
}

// Escape a value for a Typesense filter_by clause. Backticks wrap the literal so
// hyphens/spaces in slugs and "YYYY-MM" don't need escaping; a stray backtick
// can't break out.
function lit(value: string): string {
  return `\`${value.replace(/`/g, "")}\``;
}

function buildFilterBy(filters: ReportSearchFilters | undefined): string | undefined {
  if (!filters) return undefined;
  const clauses: string[] = [];
  if (filters.outcome) clauses.push(`outcome:=${lit(filters.outcome)}`);
  if (filters.roundType) clauses.push(`round_types:=[${lit(filters.roundType)}]`);
  if (filters.topics && filters.topics.length > 0) {
    clauses.push(`topic_slugs:=[${filters.topics.map(lit).join(",")}]`);
  }
  if (filters.verifiedOnly) clauses.push("evidence_verified:=true");
  return clauses.length > 0 ? clauses.join(" && ") : undefined;
}

// The Typesense hit shape we read back (only the fields we mapped into the doc).
interface ReportDocHit {
  document: {
    id: string;
    company_slug: string;
    company_name: string;
    role_slug: string;
    role_name: string;
    level: string;
    outcome?: string;
    round_types: string[];
    round_count?: number;
    topic_slugs: string[];
    topic_names: string[];
    evidence_verified: boolean;
    interview_month: string;
  };
  highlight?: {
    text?: { snippet?: string };
  };
}

// Run a faceted full-text search over the `reports` collection. A blank query
// becomes a match-all (`*`) sorted newest-first; a non-blank query ranks by
// relevance (Typesense's default text ranking) over the prose + the company /
// role / topic names. Always paginated.
export async function searchReports(
  params: ReportSearchParams,
  client: Client = getSearchClient(),
): Promise<ReportSearchResult> {
  const q = params.q.trim();
  const isMatchAll = q.length === 0;
  const filterBy = buildFilterBy(params.filters);

  const res = await client
    .collections(REPORTS_COLLECTION)
    .documents()
    .search({
      q: isMatchAll ? "*" : q,
      query_by: "text,company_name,role_name,topic_names",
      // Match-all has no relevance signal, so order by recency; a real query
      // rides Typesense's text ranking.
      ...(isMatchAll ? { sort_by: "created_at:desc" } : {}),
      ...(filterBy ? { filter_by: filterBy } : {}),
      page: params.page,
      per_page: params.perPage,
      // Highlight over the prose only — we read back the truncated snippet
      // (highlight.text.snippet), not the full field.
      highlight_fields: "text",
    });

  const hits = ((res.hits ?? []) as ReportDocHit[]).map((h) => ({
    id: h.document.id,
    companySlug: h.document.company_slug,
    companyName: h.document.company_name,
    roleSlug: h.document.role_slug,
    roleName: h.document.role_name,
    level: h.document.level,
    outcome: h.document.outcome ?? null,
    roundTypes: h.document.round_types ?? [],
    // Fall back to the deduped-type count for any doc indexed before
    // round_count was added (a stale index still renders, just approximated).
    roundCount: h.document.round_count ?? (h.document.round_types ?? []).length,
    topicSlugs: h.document.topic_slugs ?? [],
    topicNames: h.document.topic_names ?? [],
    verified: h.document.evidence_verified,
    interviewMonth: h.document.interview_month,
    snippet: isMatchAll ? null : (h.highlight?.text?.snippet ?? null),
  }));

  return {
    hits,
    found: res.found ?? 0,
    page: params.page,
    perPage: params.perPage,
    searchTimeMs: res.search_time_ms ?? 0,
  };
}
