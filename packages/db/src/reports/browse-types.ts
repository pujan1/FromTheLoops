// Row + filter shapes for the browse reads.

import type * as schema from "../schema/index.js";

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

export interface LevelBrowseRow {
  slug: string | null; // null for a custom/"N/A" level with no wedge URL
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

export interface CellReportTopic {
  slug: string;
  name: string;
}

export interface CellReportListItem {
  id: string;
  outcome: schema.InterviewReport["outcome"];
  level: string;
  companySlug: string; // per-row so a cross-company feed can label each card
  companyName: string;
  roleSlug: string; // per-row so a cross-role feed can label each card
  roleName: string;
  interviewMonth: string;
  roundCount: number;
  evidenceVerified: boolean;
  authorName: string | null; // null when anonymous
  topics: CellReportTopic[];
  helpfulCount: number; // verified non-self flaggers; input to the list ordering
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

// Position-X filters. All optional; an absent field is "no constraint".
export interface CellReportFilters {
  outcome?: schema.InterviewReport["outcome"];
  roundType?: schema.Round["roundType"];
  topics?: string[]; // matches a report carrying ANY of these (OR)
  verifiedOnly?: boolean;
  level?: string; // role-page only: pin to one level
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

export interface CompanyStats {
  reportCount: number;
  roleCount: number;
}

// One /topics index row. category null → "Other" bucket. Counts over visible reports.
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

// Question-grain: a report contributes one row per tagged question.
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

export interface CompanyTopicRow {
  slug: string;
  name: string;
  reportCount: number;
}
