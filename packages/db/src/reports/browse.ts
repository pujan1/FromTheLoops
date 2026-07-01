import { and, eq } from "drizzle-orm";
import { sql, type SQL } from "drizzle-orm";
import type { RoleCellKey } from "../pipeline/aggregates.js";
import type { Db } from "../lib/types.js";
import { companies, companyLevels, roles, topics } from "../schema/index.js";
import {
  companyReportWhere,
  globalReportWhere,
  HELPFUL_FLAG_LATERAL,
  REPORT_LIST_ORDER,
  reportFilterConditions,
  roleReportWhere,
  userReportWhere,
  VISIBLE,
} from "./browse-helpers.js";
import type {
  CellKey,
  CellReportFilters,
  CellReportList,
  CellReportSqlRow,
  CompanyBrowseRow,
  CompanyBrowseSqlRow,
  CompanyStats,
  CompanyTopicRow,
  LevelBrowseRow,
  LevelBrowseSqlRow,
  RoleBrowseRow,
  RoleBrowseSqlRow,
  TaxonomyRef,
  TopicBrowseRow,
  TopicBrowseSqlRow,
  TopicQuestionList,
  TopicQuestionSqlRow,
} from "./browse-types.js";

export async function getCompanyBySlug(
  db: Db,
  slug: string,
): Promise<TaxonomyRef | null> {
  const rows = await db
    .select({ id: companies.id, slug: companies.slug, name: companies.name })
    .from(companies)
    .where(and(eq(companies.slug, slug), eq(companies.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRoleBySlug(
  db: Db,
  slug: string,
): Promise<TaxonomyRef | null> {
  const rows = await db
    .select({ id: roles.id, slug: roles.slug, name: roles.name })
    .from(roles)
    .where(and(eq(roles.slug, slug), eq(roles.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

// Level slug is unique only within a company, so this is company-scoped.
export async function getCompanyLevelBySlug(
  db: Db,
  companyId: string,
  slug: string,
): Promise<TaxonomyRef | null> {
  const rows = await db
    .select({
      id: companyLevels.id,
      slug: companyLevels.slug,
      name: companyLevels.name,
    })
    .from(companyLevels)
    .where(
      and(
        eq(companyLevels.companyId, companyId),
        eq(companyLevels.slug, slug),
        eq(companyLevels.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listCompaniesWithReports(
  db: Db,
): Promise<CompanyBrowseRow[]> {
  const rows = await db.execute<CompanyBrowseSqlRow>(sql`
    SELECT c.id, c.slug, c.name, COUNT(r.id)::int AS report_count
    FROM companies c
    JOIN interview_reports r
      ON r.company_id = c.id
     AND r.status = 'active'
     AND r.deleted_at IS NULL
    WHERE c.status = 'active'
    GROUP BY c.id, c.slug, c.name
    HAVING COUNT(r.id) > 0
    ORDER BY report_count DESC, c.name ASC
  `);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    reportCount: Number(r.report_count),
  }));
}

export async function listRolesForCompanyWithReports(
  db: Db,
  companyId: string,
): Promise<RoleBrowseRow[]> {
  const rows = await db.execute<RoleBrowseSqlRow>(sql`
    SELECT ro.id, ro.slug, ro.name, COUNT(r.id)::int AS report_count
    FROM roles ro
    JOIN interview_reports r
      ON r.canonical_role_id = ro.id
     AND r.company_id = ${companyId}::uuid
     AND r.status = 'active'
     AND r.deleted_at IS NULL
    WHERE ro.status = 'active'
    GROUP BY ro.id, ro.slug, ro.name
    HAVING COUNT(r.id) > 0
    ORDER BY report_count DESC, ro.name ASC
  `);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    reportCount: Number(r.report_count),
  }));
}

export async function listLevelsForCompanyRoleWithReports(
  db: Db,
  companyId: string,
  canonicalRoleId: string,
): Promise<LevelBrowseRow[]> {
  const rows = await db.execute<LevelBrowseSqlRow>(sql`
    SELECT r.level AS name, cl.slug AS slug, cl.order_index AS order_index,
           COUNT(r.id)::int AS report_count
    FROM interview_reports r
    LEFT JOIN company_levels cl
      ON cl.company_id = r.company_id
     AND cl.name = r.level
     AND cl.status = 'active'
    WHERE r.company_id = ${companyId}::uuid
      AND r.canonical_role_id = ${canonicalRoleId}::uuid
      AND r.status = 'active'
      AND r.deleted_at IS NULL
    GROUP BY r.level, cl.slug, cl.order_index
    ORDER BY cl.order_index ASC NULLS LAST, r.level ASC
  `);
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    orderIndex: r.order_index === null ? null : Number(r.order_index),
    reportCount: Number(r.report_count),
  }));
}

async function runReportList(
  db: Db,
  where: SQL,
  opts: { limit: number; offset: number },
): Promise<CellReportList> {
  const rows = await db.execute<CellReportSqlRow>(sql`
    SELECT r.id, r.outcome, r.level, r.interview_month,
           c.slug AS company_slug, c.name AS company_name,
           ro.slug AS role_slug, ro.name AS role_name,
           (SELECT COUNT(*)::int FROM rounds rd WHERE rd.report_id = r.id) AS round_count,
           r.evidence_verified,
           CASE WHEN r.display_attribution = 'display_name' THEN u.display_name END AS author_name,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object('slug', sub.slug, 'name', sub.name) ORDER BY sub.name)
             FROM (
               SELECT DISTINCT t.slug, t.name
               FROM rounds rd
               JOIN questions q ON q.round_id = rd.id
               JOIN question_topics qt ON qt.question_id = q.id
               JOIN topics t ON t.id = qt.topic_id
               WHERE rd.report_id = r.id
             ) sub
           ), '[]'::jsonb) AS topics,
           hflag.cnt AS helpful_count,
           r.created_at,
           (COUNT(*) OVER ())::int AS total
    FROM interview_reports r
    JOIN users u ON u.id = r.created_by_user_id
    JOIN companies c ON c.id = r.company_id
    JOIN roles ro ON ro.id = r.canonical_role_id
    ${HELPFUL_FLAG_LATERAL}
    WHERE ${where}
    ${REPORT_LIST_ORDER}
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);
  return {
    items: rows.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      level: r.level,
      companySlug: r.company_slug,
      companyName: r.company_name,
      roleSlug: r.role_slug,
      roleName: r.role_name,
      interviewMonth: r.interview_month,
      roundCount: Number(r.round_count),
      evidenceVerified: r.evidence_verified,
      authorName: r.author_name,
      topics: r.topics ?? [],
      helpfulCount: Number(r.helpful_count),
      createdAt: new Date(r.created_at),
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

export async function listReportsForCell(
  db: Db,
  cell: CellKey,
  opts: { limit: number; offset: number; filters?: CellReportFilters },
): Promise<CellReportList> {
  const where = sql.join(
    [
      sql`r.company_id = ${cell.companyId}::uuid`,
      sql`r.canonical_role_id = ${cell.canonicalRoleId}::uuid`,
      sql`r.level = ${cell.level}`,
      ...VISIBLE,
      ...reportFilterConditions(opts.filters),
    ],
    sql` AND `,
  );
  return runReportList(db, where, opts);
}

export async function listReportsForRole(
  db: Db,
  cell: RoleCellKey,
  opts: { limit: number; offset: number; filters?: CellReportFilters },
): Promise<CellReportList> {
  return runReportList(db, roleReportWhere(cell, opts.filters), opts);
}

export async function listReportIdsForRole(
  db: Db,
  cell: RoleCellKey,
  opts: { filters?: CellReportFilters; cap: number },
): Promise<string[]> {
  return runReportIdList(db, roleReportWhere(cell, opts.filters), opts.cap);
}

async function runReportIdList(
  db: Db,
  where: SQL,
  cap: number,
): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT r.id
    FROM interview_reports r
    ${HELPFUL_FLAG_LATERAL}
    WHERE ${where}
    ${REPORT_LIST_ORDER}
    LIMIT ${cap}
  `);
  return rows.map((r) => r.id);
}

// display_attribution is the privacy boundary — anonymous reports are absent.
export async function listReportsForUser(
  db: Db,
  userId: string,
  opts: { limit: number; offset: number; filters?: CellReportFilters },
): Promise<CellReportList> {
  return runReportList(db, userReportWhere(userId, opts.filters), opts);
}

export async function listReportIdsForUser(
  db: Db,
  userId: string,
  opts: { filters?: CellReportFilters; cap: number },
): Promise<string[]> {
  return runReportIdList(db, userReportWhere(userId, opts.filters), opts.cap);
}

export async function listReportsForCompany(
  db: Db,
  companyId: string,
  opts: { limit: number; offset: number; filters?: CellReportFilters },
): Promise<CellReportList> {
  return runReportList(db, companyReportWhere(companyId, opts.filters), opts);
}

export async function listReportIdsForCompany(
  db: Db,
  companyId: string,
  opts: { filters?: CellReportFilters; cap: number },
): Promise<string[]> {
  return runReportIdList(db, companyReportWhere(companyId, opts.filters), opts.cap);
}

export async function listRecentReports(
  db: Db,
  opts: { limit: number; offset: number; filters?: CellReportFilters },
): Promise<CellReportList> {
  return runReportList(db, globalReportWhere(opts.filters), opts);
}

export async function listRecentReportIds(
  db: Db,
  opts: { filters?: CellReportFilters; cap: number },
): Promise<string[]> {
  return runReportIdList(db, globalReportWhere(opts.filters), opts.cap);
}

export async function getCompanyStats(
  db: Db,
  companyId: string,
): Promise<CompanyStats> {
  const rows = await db.execute<{ report_count: number | string; role_count: number | string }>(sql`
    SELECT COUNT(*)::int AS report_count,
           COUNT(DISTINCT r.canonical_role_id)::int AS role_count
    FROM interview_reports r
    WHERE r.company_id = ${companyId}::uuid
      AND r.status = 'active'
      AND r.deleted_at IS NULL
  `);
  return {
    reportCount: rows[0] ? Number(rows[0].report_count) : 0,
    roleCount: rows[0] ? Number(rows[0].role_count) : 0,
  };
}

export async function countActiveReportsForCompanyRole(
  db: Db,
  companyId: string,
  canonicalRoleId: string,
): Promise<number> {
  const rows = await db.execute<{ count: number | string }>(sql`
    SELECT COUNT(*)::int AS count
    FROM interview_reports r
    WHERE r.company_id = ${companyId}::uuid
      AND r.canonical_role_id = ${canonicalRoleId}::uuid
      AND r.status = 'active'
      AND r.deleted_at IS NULL
  `);
  return rows[0] ? Number(rows[0].count) : 0;
}

export async function getTopicBySlug(
  db: Db,
  slug: string,
): Promise<TaxonomyRef | null> {
  const rows = await db
    .select({ id: topics.id, slug: topics.slug, name: topics.name })
    .from(topics)
    .where(and(eq(topics.slug, slug), eq(topics.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

// Includes zero-report topics — the curated taxonomy is itself the index's content.
export async function listTopicsForIndex(db: Db): Promise<TopicBrowseRow[]> {
  const rows = await db.execute<TopicBrowseSqlRow>(sql`
    SELECT t.id, t.slug, t.name, t.category,
           COUNT(DISTINCT q.id) FILTER (
             WHERE r.status = 'active' AND r.deleted_at IS NULL
           )::int AS question_count,
           COUNT(DISTINCT r.id) FILTER (
             WHERE r.status = 'active' AND r.deleted_at IS NULL
           )::int AS report_count
    FROM topics t
    LEFT JOIN question_topics qt ON qt.topic_id = t.id
    LEFT JOIN questions q ON q.id = qt.question_id
    LEFT JOIN rounds rd ON rd.id = q.round_id
    LEFT JOIN interview_reports r ON r.id = rd.report_id
    WHERE t.status = 'active'
    GROUP BY t.id, t.slug, t.name, t.category
    ORDER BY t.name ASC
  `);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    questionCount: Number(r.question_count),
    reportCount: Number(r.report_count),
  }));
}

export async function listCompaniesForTopic(
  db: Db,
  topicId: string,
): Promise<CompanyBrowseRow[]> {
  const rows = await db.execute<CompanyBrowseSqlRow>(sql`
    SELECT c.id, c.slug, c.name, COUNT(DISTINCT r.id)::int AS report_count
    FROM companies c
    JOIN interview_reports r
      ON r.company_id = c.id
     AND r.status = 'active'
     AND r.deleted_at IS NULL
    WHERE c.status = 'active'
      AND EXISTS (
        SELECT 1 FROM rounds rd
        JOIN questions q ON q.round_id = rd.id
        JOIN question_topics qt ON qt.question_id = q.id
        WHERE rd.report_id = r.id AND qt.topic_id = ${topicId}::uuid
      )
    GROUP BY c.id, c.slug, c.name
    HAVING COUNT(DISTINCT r.id) > 0
    ORDER BY report_count DESC, c.name ASC
  `);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    reportCount: Number(r.report_count),
  }));
}

export async function listQuestionsForTopic(
  db: Db,
  topicId: string,
  opts: { limit: number; offset: number; companyId?: string },
): Promise<TopicQuestionList> {
  const scope = opts.companyId
    ? sql`AND r.company_id = ${opts.companyId}::uuid`
    : sql``;
  const rows = await db.execute<TopicQuestionSqlRow>(sql`
    SELECT q.id AS question_id, q.question_prose AS prose,
           r.id AS report_id, r.level, r.outcome, r.interview_month,
           r.evidence_verified, r.created_at,
           c.slug AS company_slug, c.name AS company_name,
           ro.slug AS role_slug, ro.name AS role_name,
           (COUNT(*) OVER ())::int AS total
    FROM questions q
    JOIN rounds rd ON rd.id = q.round_id
    JOIN interview_reports r ON r.id = rd.report_id
    JOIN companies c ON c.id = r.company_id
    JOIN roles ro ON ro.id = r.canonical_role_id
    WHERE r.status = 'active'
      AND r.deleted_at IS NULL
      ${scope}
      AND EXISTS (
        SELECT 1 FROM question_topics qt
        WHERE qt.question_id = q.id AND qt.topic_id = ${topicId}::uuid
      )
    ORDER BY r.created_at DESC, r.id, rd.order_index, q.order_index
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);
  return {
    items: rows.map((r) => ({
      questionId: r.question_id,
      prose: r.prose,
      reportId: r.report_id,
      companySlug: r.company_slug,
      companyName: r.company_name,
      roleSlug: r.role_slug,
      roleName: r.role_name,
      level: r.level,
      outcome: r.outcome,
      interviewMonth: r.interview_month,
      evidenceVerified: r.evidence_verified,
      createdAt: new Date(r.created_at),
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

export async function countReportsForTopic(
  db: Db,
  topicId: string,
  companyId?: string,
): Promise<number> {
  const scope = companyId ? sql`AND r.company_id = ${companyId}::uuid` : sql``;
  const rows = await db.execute<{ count: number | string }>(sql`
    SELECT COUNT(DISTINCT r.id)::int AS count
    FROM interview_reports r
    WHERE r.status = 'active'
      AND r.deleted_at IS NULL
      ${scope}
      AND EXISTS (
        SELECT 1 FROM rounds rd
        JOIN questions q ON q.round_id = rd.id
        JOIN question_topics qt ON qt.question_id = q.id
        WHERE rd.report_id = r.id AND qt.topic_id = ${topicId}::uuid
      )
  `);
  return rows[0] ? Number(rows[0].count) : 0;
}

export async function listTopTopicsForCompany(
  db: Db,
  companyId: string,
  limit: number,
): Promise<CompanyTopicRow[]> {
  const rows = await db.execute<{
    slug: string;
    name: string;
    report_count: number | string;
  }>(sql`
    SELECT t.slug, t.name, COUNT(DISTINCT r.id)::int AS report_count
    FROM topics t
    JOIN question_topics qt ON qt.topic_id = t.id
    JOIN questions q ON q.id = qt.question_id
    JOIN rounds rd ON rd.id = q.round_id
    JOIN interview_reports r ON r.id = rd.report_id
    WHERE r.company_id = ${companyId}::uuid
      AND r.status = 'active'
      AND r.deleted_at IS NULL
      AND t.status = 'active'
    GROUP BY t.slug, t.name
    HAVING COUNT(DISTINCT r.id) > 0
    ORDER BY report_count DESC, t.name ASC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    reportCount: Number(r.report_count),
  }));
}
