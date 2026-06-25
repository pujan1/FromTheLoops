// Read-side queries for the public browse surface (Sprint 4): the `/companies`
// index, the company / company-role rollup pages, the wedge cell's report list,
// and the slug lookups the canonical URL resolver (packages/core/url) composes.
//
// Visibility filter is IDENTICAL to the aggregate + search pipelines —
// `status = 'active' AND deleted_at IS NULL` — so a pending/deleted report can
// never surface on a public page. (In V1 nothing flips a real report to active
// yet; the seed_dummy fixtures are inserted active for exactly this surface.)
//
// Style: simple slug lookups use the query builder; the GROUP BY / COUNT rollup
// reads use db.execute(sql`…`) with a typed row alias, mirroring getAggregate in
// aggregates.ts (postgres.js returns COUNT as a string, so every read casts
// `::int` in SQL and the mapper coerces with Number() defensively).
//
// Row/filter shapes live in ./browse-types.js; the shared visibility/scope/
// filter SQL composition lives in ./browse-helpers.js.

import { and, eq } from "drizzle-orm";
import { sql, type SQL } from "drizzle-orm";
import type { RoleCellKey } from "../pipeline/aggregates.js";
import type { Db } from "../lib/types.js";
import { companies, companyLevels, roles, topics } from "../schema/index.js";
import {
  companyReportWhere,
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

// ---------------------------------------------------------------------------
// Slug lookups — the resolver's primitives. Active rows only (a pending/merged
// company is not a public, linkable page).
// ---------------------------------------------------------------------------

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

// Level slug is unique only within a company, so this is company-scoped. Returns
// the display name (`name`) the report rows + aggregate are keyed on.
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

// ---------------------------------------------------------------------------
// Rollup reads — each row carries the visible report count that drives the
// index / company / role pages. Empty cells are excluded (HAVING count > 0):
// a company/role/level with no public reports is not a page worth linking.
// ---------------------------------------------------------------------------

// Companies that have ≥1 visible report, busiest first. Drives /companies.
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

// Roles with ≥1 visible report at one company, busiest first. Drives
// /companies/[company].
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

// Distinct level values for a (company, role), with counts. Grouped on the
// report's text `level` (what the wedge index + aggregate are keyed on), left
// joined to company_levels for the slug + ladder order. Drives
// /companies/[company]/[role].
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

// ---------------------------------------------------------------------------
// Wedge cell report list (Position X). Day 2 shipped paginated + unfiltered;
// Day 4 added the per-report topic chips; Day 5 layers the filter predicates
// (outcome / round-type / topics / trust-tier) on top of the same read. The
// scope/visibility/filter WHERE composition lives in ./browse-helpers.js.
// ---------------------------------------------------------------------------

// The one report-list query. Takes the already-built WHERE (scope + filters),
// runs the paginated, newest-first read with the window total, and maps rows.
// Every list surface (cell / role / company) funnels through here so the SELECT
// shape — round_count, per-row role, topics, attribution, total — is defined
// once. The visibility filter (active + not deleted) is folded into `where` by
// the callers, identical to the aggregate/search pipelines.
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

// One page of visible reports for a (company, role, level) cell, newest first,
// plus the window total (over() so it costs one query, not two). Optional
// `filters` narrow the result set (and the window total, so pagination reflects
// them). The level is pinned by the cell, so filters.level is redundant here.
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

// One page of visible reports for a (company, role) across ALL levels — the role
// page's Position X. `filters.level` narrows to one level (the level-page view);
// absent, every level (incl. Unspecified) is listed. Newest first.
export async function listReportsForRole(
  db: Db,
  cell: RoleCellKey,
  opts: { limit: number; offset: number; filters?: CellReportFilters },
): Promise<CellReportList> {
  return runReportList(db, roleReportWhere(cell, opts.filters), opts);
}

// The full, ordered ID list for a (company, role) under the active filter —
// capped. This is the ADR-0010 "ordered-ID provider": it feeds the client triage
// pane's prev/next engine, which walks the WHOLE filtered result set (not just
// the visible page). Reuses roleReportWhere + the shared HELPFUL_FLAG_LATERAL /
// REPORT_LIST_ORDER, so IDs come back in the exact order listReportsForRole
// paginates them. `cap` bounds pathological filters (a heavy filter that matches
// everything): past the cap, "next" simply stops — a page-bounded fallback, not a
// correctness hole. The pane underneath still has its real `?page=` URLs.
export async function listReportIdsForRole(
  db: Db,
  cell: RoleCellKey,
  opts: { filters?: CellReportFilters; cap: number },
): Promise<string[]> {
  return runReportIdList(db, roleReportWhere(cell, opts.filters), opts.cap);
}

// The ordered-ID read. Same FROM/LATERAL/ORDER as runReportList, selecting only
// `r.id` — so the order is identical by construction, never by coincidence.
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

// One page of a user's VISIBLE, *attributed* reports across all companies — the
// /u/[username] profile feed. The display_attribution='display_name' predicate
// is the privacy boundary: a report the author posted anonymously never appears
// on their public profile, even though they earn karma for it (anonymity is
// account-bound, not contribution-bound — see PLAN.md §Anonymity). Each item
// carries its own company AND role (the profile spans both axes), so the shared
// ReportList renders them with per-row company/role. Newest first.
export async function listReportsForUser(
  db: Db,
  userId: string,
  opts: { limit: number; offset: number; filters?: CellReportFilters },
): Promise<CellReportList> {
  return runReportList(db, userReportWhere(userId, opts.filters), opts);
}

// Ordered-ID provider for the profile feed (ADR-0010). Same scope + filters as
// listReportsForUser, so the triage pane/sheet steps through the exact attributed
// set the page paginates. See listReportIdsForRole for the cap semantics.
export async function listReportIdsForUser(
  db: Db,
  userId: string,
  opts: { filters?: CellReportFilters; cap: number },
): Promise<string[]> {
  return runReportIdList(db, userReportWhere(userId, opts.filters), opts.cap);
}

// One page of visible reports across ALL roles at a company — the company page's
// recent feed. Each item carries its own role (slug/name) so a cross-role card
// can label + link itself. Filters honored: outcome (+ the generic facets);
// level is intentionally NOT a company-page facet (it means different things per
// role), but reportFilterConditions tolerates it if passed.
export async function listReportsForCompany(
  db: Db,
  companyId: string,
  opts: { limit: number; offset: number; filters?: CellReportFilters },
): Promise<CellReportList> {
  return runReportList(db, companyReportWhere(companyId, opts.filters), opts);
}

// Ordered-ID provider for the company feed (ADR-0010). Same scope + filters as
// listReportsForCompany. See listReportIdsForRole for the cap semantics.
export async function listReportIdsForCompany(
  db: Db,
  companyId: string,
  opts: { filters?: CellReportFilters; cap: number },
): Promise<string[]> {
  return runReportIdList(db, companyReportWhere(companyId, opts.filters), opts.cap);
}

// Headline counts for the company page header: total visible reports + how many
// distinct roles they span. One round-trip.
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

// Count VISIBLE reports for a (company, role) across ALL levels — the "role"
// scope in the sparse-data ladder (packages/core/aggregation/scope). The wedge
// page compares this against the exact-cell count to decide whether to broaden
// and what the banner says. Same visibility filter as everything else.
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

// ===========================================================================
// Topic browse reads (Sprint 5) — the question-first discovery axis. Powers
// /topics (index, grouped by category), /topics/[topic] (questions aggregated
// across every company), and /topics/[topic]/[company] (filtered to one
// company, with the same sparse-data fallback the wedge page uses).
//
// Grain note: unlike the company/role surfaces (report-grain), the topic pages
// are QUESTION-grain — PLAN.md §URL: "topic pages aggregate questions". A topic
// page lists individual questions, each carrying its source report's company /
// role / outcome so the card links back to /reports/[id]. The "is this cell
// thin?" decision, though, counts distinct REPORTS (matching the wedge's
// <10-reports rule) so a topic with many questions from one report still reads
// as a small sample.
//
// Visibility filter is identical everywhere else: a question only surfaces when
// its report is status='active' AND deleted_at IS NULL.
// ===========================================================================

// Active-topic slug lookup — the resolver primitive for the topic routes,
// mirroring getCompanyBySlug/getRoleBySlug. Pending/merged tags aren't public
// pages.
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

// Every active topic with its visible question/report counts, name-sorted. The
// index page groups these by `category` in app code (category order is a
// presentation concern). Topics with zero reports ARE included — the curated
// taxonomy is the index's content, and a count of 0 reads honestly.
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

// Companies that have ≥1 visible report touching a topic, busiest first. Drives
// the company chips on /topics/[topic] (each links to /topics/[topic]/[company])
// — the topic-page analogue of the role nav on the company page.
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

// One page of visible questions tagged with a topic, newest report first. With
// `companyId` set, narrowed to that company (the /topics/[topic]/[company]
// view); absent, every company. The window total rides along (over()) so
// pagination costs one query.
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

// Count VISIBLE reports touching a topic, optionally scoped to one company.
// This is the "cell density" the topic×company page feeds into the sparse-data
// decision (decideScope): topic×company is the exact cell, topic-only the
// broader corpus. Distinct reports (not questions) to match the wedge's
// <10-reports threshold.
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

// Top topics across a company's visible reports, busiest first — the "top tags"
// section the Sprint 5 company rollup adds. Each row links to
// /topics/[topic]/[company]. reportCount = distinct reports at the company whose
// questions carry the topic; capped by the caller's `limit`.
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
