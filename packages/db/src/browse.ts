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

import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql, type SQL } from "drizzle-orm";
import type { RoleCellKey } from "./aggregates.js";
import * as schema from "./schema/index.js";
import { companies, companyLevels, roles } from "./schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;

// A resolved taxonomy node: the trio the URL resolver and page headers need.
export interface TaxonomyRef {
  id: string;
  slug: string;
  name: string;
}

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

export interface CompanyBrowseRow extends TaxonomyRef {
  reportCount: number;
}

type CompanyBrowseSqlRow = {
  id: string;
  slug: string;
  name: string;
  report_count: number | string;
};

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

export interface RoleBrowseRow extends TaxonomyRef {
  reportCount: number;
}

type RoleBrowseSqlRow = CompanyBrowseSqlRow;

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

// A level rung in a (company, role) rollup. `slug` is null when the report's
// level text has no matching company_levels row (a custom / "N/A" level) — such
// a rung has no canonical wedge URL, so the page renders it without a link.
export interface LevelBrowseRow {
  slug: string | null;
  name: string;
  orderIndex: number | null;
  reportCount: number;
}

type LevelBrowseSqlRow = {
  slug: string | null;
  name: string;
  order_index: number | string | null;
  report_count: number | string;
};

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
// (outcome / round-type / topics / trust-tier) on top of the same read.
// ---------------------------------------------------------------------------

// A topic shown as a chip on a report card. Slug links to /topics/[slug].
export interface CellReportTopic {
  slug: string;
  name: string;
}

export interface CellReportListItem {
  id: string;
  outcome: schema.InterviewReport["outcome"];
  level: string;
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
// field is "no constraint", so an unfiltered call is the Day-2 behavior. The
// types are the db's own enum-derived types — browse.ts stays free of a
// @fromtheloop/shared dep (same rule as aggregates.ts).
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

type CellReportSqlRow = {
  id: string;
  outcome: schema.InterviewReport["outcome"];
  level: string;
  role_slug: string;
  role_name: string;
  interview_month: string;
  round_count: number | string;
  evidence_verified: boolean;
  author_name: string | null;
  topics: CellReportTopic[] | null;
  created_at: string | Date;
  total: number | string;
};

// The optional, facet-driven WHERE clauses shared by every report-list read
// (cell / role / company). The scope clauses (company/role/level) are the
// caller's; these are the user-toggled filters. Topic / round-type filters are
// EXISTS sub-selects so a report is counted once however many of its
// rounds/questions match. Returns the extra conditions to AND onto the scope.
function reportFilterConditions(filters?: CellReportFilters): SQL[] {
  const conditions: SQL[] = [];
  if (!filters) return conditions;
  if (filters.outcome) conditions.push(sql`r.outcome = ${filters.outcome}`);
  if (filters.level) conditions.push(sql`r.level = ${filters.level}`);
  if (filters.verifiedOnly) conditions.push(sql`r.evidence_verified = true`);
  if (filters.roundType) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM rounds rd
      WHERE rd.report_id = r.id AND rd.round_type = ${filters.roundType}
    )`);
  }
  if (filters.topics && filters.topics.length > 0) {
    // IN-list (one bound param per slug) rather than `= ANY($arr)` — drizzle's
    // sql template binds a JS array as a scalar, which postgres rejects as a
    // malformed array literal.
    const slugList = sql.join(
      filters.topics.map((slug) => sql`${slug}`),
      sql`, `,
    );
    conditions.push(sql`EXISTS (
      SELECT 1 FROM rounds rd
      JOIN questions q ON q.round_id = rd.id
      JOIN question_topics qt ON qt.question_id = q.id
      JOIN topics t ON t.id = qt.topic_id
      WHERE rd.report_id = r.id AND t.slug IN (${slugList})
    )`);
  }
  return conditions;
}

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
           r.created_at,
           (COUNT(*) OVER ())::int AS total
    FROM interview_reports r
    JOIN users u ON u.id = r.created_by_user_id
    JOIN roles ro ON ro.id = r.canonical_role_id
    WHERE ${where}
    ORDER BY r.created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);
  return {
    items: rows.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      level: r.level,
      roleSlug: r.role_slug,
      roleName: r.role_name,
      interviewMonth: r.interview_month,
      roundCount: Number(r.round_count),
      evidenceVerified: r.evidence_verified,
      authorName: r.author_name,
      topics: r.topics ?? [],
      createdAt: new Date(r.created_at),
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

const VISIBLE = [sql`r.status = 'active'`, sql`r.deleted_at IS NULL`];

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
  const where = sql.join(
    [
      sql`r.company_id = ${cell.companyId}::uuid`,
      sql`r.canonical_role_id = ${cell.canonicalRoleId}::uuid`,
      ...VISIBLE,
      ...reportFilterConditions(opts.filters),
    ],
    sql` AND `,
  );
  return runReportList(db, where, opts);
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
  const where = sql.join(
    [
      sql`r.company_id = ${companyId}::uuid`,
      ...VISIBLE,
      ...reportFilterConditions(opts.filters),
    ],
    sql` AND `,
  );
  return runReportList(db, where, opts);
}

// Headline counts for the company page header: total visible reports + how many
// distinct roles they span. One round-trip.
export interface CompanyStats {
  reportCount: number;
  roleCount: number;
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
