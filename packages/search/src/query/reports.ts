// The read side of the `reports` collection — the only place a Typesense search
// is shaped. Returns just enough of each doc to render a result card (no
// Postgres round-trip).

import type { Client } from "typesense";
import { REPORTS_COLLECTION } from "../schemas/reports.js";
import { getSearchClient } from "../client.js";

// Facet constraints, all optional (absent = no constraint).
export interface ReportSearchFilters {
  outcome?: string;
  roundType?: string;
  topics?: string[]; // matches a report carrying ANY (OR)
  verifiedOnly?: boolean;
}

export interface ReportSearchParams {
  q: string; // blank → match-all, newest-first
  filters?: ReportSearchFilters;
  page: number;
  perPage: number;
}

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
  snippet: string | null; // matched body fragment with <mark>; null for match-all
}

export interface ReportSearchResult {
  hits: ReportSearchHit[];
  found: number; // total matching docs across all pages
  page: number;
  perPage: number;
  searchTimeMs: number;
}

// Backtick-wrap a filter_by literal so slugs/months need no escaping.
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

// Faceted full-text search. Blank query → match-all sorted newest-first.
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
      ...(isMatchAll ? { sort_by: "created_at:desc" } : {}), // no relevance signal
      ...(filterBy ? { filter_by: filterBy } : {}),
      page: params.page,
      per_page: params.perPage,
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
    roundCount: h.document.round_count ?? (h.document.round_types ?? []).length, // fallback for pre-field docs
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
