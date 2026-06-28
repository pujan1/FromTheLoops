// One place query-string filters are parsed and built. Parsing is resilient
// (malformed params degrade to defaults via .catch()/.default(), never throw);
// building is canonical (empties dropped, keys sorted) for stable cacheable URLs.

import { z } from "zod";
import { outcomeSchema, roundTypeSchema } from "./submission.js";

// A browser URLSearchParams or Next's plain record (repeated key → string[]).
export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

// Normalize either shape into a plain record.
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

// Always succeeds for a schema whose fields carry .catch()/.default().
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

// Empties dropped, arrays → repeated keys, sorted. Returns "" (not "?") when empty.
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

export const REPORT_SORTS = ["recent", "helpful", "relevant"] as const;
export const reportSortSchema = z.enum(REPORT_SORTS);
export type ReportSort = z.infer<typeof reportSortSchema>;

// Trust-tier floor. Enum (not boolean) so the URL reads `?trust=verified`.
export const REPORT_TRUST_TIERS = ["all", "verified"] as const;
export const reportTrustSchema = z.enum(REPORT_TRUST_TIERS);
export type ReportTrustTier = z.infer<typeof reportTrustSchema>;

export const DEFAULT_REPORT_SORT: ReportSort = "recent";
export const DEFAULT_REPORT_TRUST: ReportTrustTier = "all";
export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

// Tolerant of ?topics=a&topics=b and ?topics=a,b. Trims, dedupes; bad → [].
const slugListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")))
  .transform((arr) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))])
  .catch([] as string[]);

export const reportFiltersSchema = z.object({
  q: z.string().trim().max(120).catch("").default(""),
  outcome: outcomeSchema.optional().catch(undefined),
  roundType: roundTypeSchema.optional().catch(undefined),
  level: z.string().trim().max(80).optional().catch(undefined), // per-company level slug; unknown falls through
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

// Canonical query string, omitting fields at their default.
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

// The one place public browse URLs are built. Pure string construction; lives
// in shared (not core) so client code can import it without the db dependency.
// Slugs are assumed already-normalized; these only URL-encode.

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

// levelSlug is a per-company level slug, unique within the company.
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

// `username` is the public handle (users.username).
export function userPath(username: string): string {
  return `/u/${enc(username)}`;
}
