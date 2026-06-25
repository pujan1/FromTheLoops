// Row + filter shapes for the browse reads (Sprint 4/5). Split out of browse.ts
// so the query module reads as queries: the public result types and the internal
// SQL-row aliases each query maps from live here. The types are the db's own
// enum-derived types (schema.*), keeping browse free of a @fromtheloop/shared dep
// (same rule as aggregates.ts).

import type * as schema from "../schema/index.js";

// A resolved taxonomy node: the trio the URL resolver and page headers need.
export interface TaxonomyRef {
  id: string;
  slug: string;
  name: string;
}

export interface CompanyBrowseRow extends TaxonomyRef {
  reportCount: number;
}

export type CompanyBrowseSqlRow = {
  id: string;
  slug: string;
  name: string;
  report_count: number | string;
};

export interface RoleBrowseRow extends TaxonomyRef {
  reportCount: number;
}

export type RoleBrowseSqlRow = CompanyBrowseSqlRow;

// A level rung in a (company, role) rollup. `slug` is null when the report's
// level text has no matching company_levels row (a custom / "N/A" level) — such
// a rung has no canonical wedge URL, so the page renders it without a link.
export interface LevelBrowseRow {
  slug: string | null;
  name: string;
  orderIndex: number | null;
  reportCount: number;
}

export type LevelBrowseSqlRow = {
  slug: string | null;
  name: string;
  order_index: number | string | null;
  report_count: number | string;
};

// A topic shown as a chip on a report card. Slug links to /topics/[slug].
export interface CellReportTopic {
  slug: string;
  name: string;
}

export interface CellReportListItem {
  id: string;
  outcome: schema.InterviewReport["outcome"];
  level: string;
  // The report's company — carried per-row so a cross-company feed (the user
  // profile) can label + link each card; constant on the company/role/level
  // pages (which pass `companyName` to ReportList once).
  companySlug: string;
  companyName: string;
  // The report's canonical role — carried per-row so a cross-role feed (the
  // company page) can label + link each card; constant on the role/level pages.
  roleSlug: string;
  roleName: string;
  interviewMonth: string;
  roundCount: number;
  evidenceVerified: boolean;
  // The author's display name when the report opted into attribution; null when
  // anonymous (the page renders "Anonymous").
  authorName: string | null;
  // Distinct topics across the report's questions, name-sorted. The card slices
  // the first few; the full set rides along for callers that want it.
  topics: CellReportTopic[];
  // How many readers flagged this report helpful (verified, non-self flaggers
  // only — the same population that earns the author karma). Surfaced on the
  // card and the input to the list's karma-weighted ordering (see runReportList).
  helpfulCount: number;
  createdAt: Date;
}

export interface CellReportList {
  items: CellReportListItem[];
  total: number;
}

export interface CellKey {
  companyId: string;
  canonicalRoleId: string;
  level: string;
}

// The Position-X filters, mirroring the shared `reportFiltersSchema`
// (packages/shared/url) minus the search-only fields. All optional; an absent
// field is "no constraint", so an unfiltered call is the Day-2 behavior.
export interface CellReportFilters {
  outcome?: schema.InterviewReport["outcome"];
  roundType?: schema.Round["roundType"];
  // Topic slugs; a report matches if it carries ANY of them (OR within the
  // facet — friendlier than AND on sparse data; documented in ADR / sprint).
  topics?: string[];
  // Trust-tier floor: when true, only evidence-verified reports.
  verifiedOnly?: boolean;
  // Level facet (role-page only): pin to a single level text. The role page
  // lists ALL levels by default; this narrows to one (e.g. ?level=L4 → the
  // exact level text the slug resolves to). Ignored on the level-pinned read.
  level?: string;
}

export type CellReportSqlRow = {
  id: string;
  outcome: schema.InterviewReport["outcome"];
  level: string;
  company_slug: string;
  company_name: string;
  role_slug: string;
  role_name: string;
  interview_month: string;
  round_count: number | string;
  evidence_verified: boolean;
  author_name: string | null;
  topics: CellReportTopic[] | null;
  helpful_count: number | string;
  created_at: string | Date;
  total: number | string;
};

// Headline counts for the company page header: total visible reports + how many
// distinct roles they span.
export interface CompanyStats {
  reportCount: number;
  roleCount: number;
}

// One topic row for the /topics index. `category` is the curated grouping the
// page renders sections from (null → the "Other" bucket). Counts are over
// VISIBLE reports only: questionCount = distinct tagged questions, reportCount =
// distinct reports those questions live in (the count badge the page shows).
export interface TopicBrowseRow {
  id: string;
  slug: string;
  name: string;
  category: schema.Topic["category"];
  questionCount: number;
  reportCount: number;
}

export type TopicBrowseSqlRow = {
  id: string;
  slug: string;
  name: string;
  category: schema.Topic["category"];
  question_count: number | string;
  report_count: number | string;
};

// One question in a topic's question list. Carries its source report's
// company / role / level / outcome so the card can label itself and link to
// /reports/[reportId]. (Question-grain: the same report contributes one row per
// tagged question.)
export interface TopicQuestionListItem {
  questionId: string;
  prose: string;
  reportId: string;
  companySlug: string;
  companyName: string;
  roleSlug: string;
  roleName: string;
  level: string;
  outcome: schema.InterviewReport["outcome"];
  interviewMonth: string;
  evidenceVerified: boolean;
  createdAt: Date;
}

export interface TopicQuestionList {
  items: TopicQuestionListItem[];
  total: number;
}

export type TopicQuestionSqlRow = {
  question_id: string;
  prose: string;
  report_id: string;
  company_slug: string;
  company_name: string;
  role_slug: string;
  role_name: string;
  level: string;
  outcome: schema.InterviewReport["outcome"];
  interview_month: string;
  evidence_verified: boolean;
  created_at: string | Date;
  total: number | string;
};

// Top topics across a company's visible reports — the "top tags" section the
// Sprint 5 company rollup adds. Each row links to /topics/[topic]/[company].
export interface CompanyTopicRow {
  slug: string;
  name: string;
  reportCount: number;
}
