// URL search-param state.
//
// The single place query-string filters are parsed and built, so the wedge /
// search / admin surfaces share one contract instead of each hand-rolling
// URLSearchParams reads. Zod does the coercing and bounding; the concrete
// report-filter schema lives here too.
//
// Parsing is deliberately resilient: a filter URL is user-editable (and
// crawlable), so a malformed param must degrade to its default, never throw a
// 500. The schema fields carry .catch()/.default() to guarantee that, and
// `parseSearchParams` always returns a fully-formed value.
//
// Building is canonical: empties are dropped and keys are emitted in a stable
// order, so the same filter state always yields the same URL (good for caching
// and for not generating duplicate crawlable pages).

import { z } from "zod";
import { outcomeSchema, roundTypeSchema } from "./submission.js";

// What a framework hands us for query params: a browser/History URLSearchParams
// or Next's plain record (a repeated key arrives as a string[]).
export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

// Normalize either input shape into a plain record, collapsing single-value
// keys to a string and keeping repeated keys as an array — the shape the field
// schemas below expect.
function toRecord(
  input: SearchParamsInput,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (input instanceof URLSearchParams) {
    for (const key of new Set(input.keys())) {
      const all = input.getAll(key);
      out[key] = all.length > 1 ? all : (all[0] ?? "");
    }
    return out;
  }
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// Parse query params into typed filter state. Always succeeds for a schema whose
// fields carry .catch()/.default() (like reportFiltersSchema), so callers never
// need a try/catch around their URL.
export function parseSearchParams<S extends z.ZodTypeAny>(
  schema: S,
  input: SearchParamsInput,
): z.infer<S> {
  return schema.parse(toRecord(input));
}

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | (string | number)[];

// Build a clean query string from filter values: empties (undefined, null, "",
// empty arrays) are dropped, arrays become repeated keys, and keys are emitted
// in sorted order so equivalent state is byte-identical. Returns "" (not "?")
// when nothing remains, so it's safe to append unconditionally.
export function buildQueryString(values: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(values).sort()) {
    const value = values[key];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          params.append(key, String(item));
        }
      }
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// Report filters — the search/aggregation surface (Sprint 4).
// ---------------------------------------------------------------------------

export const REPORT_SORTS = ["recent", "helpful", "relevant"] as const;
export const reportSortSchema = z.enum(REPORT_SORTS);
export type ReportSort = z.infer<typeof reportSortSchema>;

// Trust-tier floor for the Position-X list. "all" is no constraint; "verified"
// restricts to evidence-verified reports. A two-value enum (not a bare boolean)
// so the URL reads `?trust=verified` and future tiers slot in cleanly.
export const REPORT_TRUST_TIERS = ["all", "verified"] as const;
export const reportTrustSchema = z.enum(REPORT_TRUST_TIERS);
export type ReportTrustTier = z.infer<typeof reportTrustSchema>;

export const DEFAULT_REPORT_SORT: ReportSort = "recent";
export const DEFAULT_REPORT_TRUST: ReportTrustTier = "all";
export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

// A multi-value string param tolerant of both ?topics=a&topics=b and
// ?topics=a,b. Trims, drops blanks, de-dupes; bad input degrades to [].
const slugListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")))
  .transform((arr) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))])
  .catch([] as string[]);

export const reportFiltersSchema = z.object({
  // Free-text query. Bounded so a pathological URL can't balloon downstream.
  q: z.string().trim().max(120).catch("").default(""),
  outcome: outcomeSchema.optional().catch(undefined),
  roundType: roundTypeSchema.optional().catch(undefined),
  // Level facet (role page): a per-company level SLUG (e.g. "l4"). The page
  // resolves it to the level text to filter + swap Position Y to that cell. A
  // bounded free string (slugs aren't a closed enum); unknown slugs resolve to
  // "no level cell" and just fall through to the whole-role view.
  level: z.string().trim().max(80).optional().catch(undefined),
  topics: slugListSchema.default([]),
  trust: reportTrustSchema.catch(DEFAULT_REPORT_TRUST).default(DEFAULT_REPORT_TRUST),
  sort: reportSortSchema.catch(DEFAULT_REPORT_SORT).default(DEFAULT_REPORT_SORT),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PER_PAGE)
    .catch(DEFAULT_PER_PAGE)
    .default(DEFAULT_PER_PAGE),
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

// Parse a URL's params into report filters (always succeeds).
export function parseReportFilters(input: SearchParamsInput): ReportFilters {
  return parseSearchParams(reportFiltersSchema, input);
}

// Serialize report filters back to a canonical query string, omitting any field
// still at its default so a pristine view is a bare URL and equivalent filter
// states share one cacheable address.
export function buildReportFiltersQuery(filters: ReportFilters): string {
  return buildQueryString({
    q: filters.q || undefined,
    outcome: filters.outcome,
    roundType: filters.roundType,
    level: filters.level,
    topics: filters.topics,
    trust: filters.trust === DEFAULT_REPORT_TRUST ? undefined : filters.trust,
    sort: filters.sort === DEFAULT_REPORT_SORT ? undefined : filters.sort,
    page: filters.page > 1 ? filters.page : undefined,
    perPage: filters.perPage === DEFAULT_PER_PAGE ? undefined : filters.perPage,
  });
}

// ---------------------------------------------------------------------------
// Canonical browse-path builders (Sprint 4).
//
// THE one place the public browse URLs are constructed — every link + redirect
// builds its href through these, never a hand-written template, so the URL
// shape is defined once. Pure string construction (no DB, no I/O), and lives in
// shared (not core) because lib/routes + client components import it and must
// not pull in the db/postgres dependency the core resolver carries.
//
// Slugs are assumed already-normalized (the curated seed + suggest-pending path
// store lowercase hyphenated slugs). These builders emit what they're given and
// only URL-encode; the db-backed resolver (@fromtheloop/core) does exact slug
// lookups, so a non-canonical (e.g. uppercased) path 404s rather than rendering
// duplicate content at two URLs.
//
//   /companies
//   /companies/:company
//   /companies/:company/:role
//   /companies/:company/:role/:level     ← the canonical wedge page
//   /reports/:id
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;

export function companiesPath(): string {
  return "/companies";
}

export function companyPath(companySlug: string): string {
  return `/companies/${enc(companySlug)}`;
}

export function companyRolePath(companySlug: string, roleSlug: string): string {
  return `/companies/${enc(companySlug)}/${enc(roleSlug)}`;
}

// levelSlug is a per-company level slug (company_levels.slug) — "l4", "sde-ii",
// "e4" — unique within the company.
export function wedgePath(
  companySlug: string,
  roleSlug: string,
  levelSlug: string,
): string {
  return `/companies/${enc(companySlug)}/${enc(roleSlug)}/${enc(levelSlug)}`;
}

export function reportPath(reportId: string): string {
  return `/reports/${enc(reportId)}`;
}

// Topic browse paths (Sprint 5). `topicSlug` is topics.slug; `companySlug` is
// companies.slug. /topics/[topic]/[company] is the topic-filtered-to-a-company
// surface (the second discovery axis' programmatic-SEO leaf).
export function topicsPath(): string {
  return "/topics";
}

export function topicPath(topicSlug: string): string {
  return `/topics/${enc(topicSlug)}`;
}

export function topicCompanyPath(
  topicSlug: string,
  companySlug: string,
): string {
  return `/topics/${enc(topicSlug)}/${enc(companySlug)}`;
}
