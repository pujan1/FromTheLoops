import { decideLevelView } from "@fromtheloop/core";
import {
  type CellReportFilters,
  getAggregate,
  getDb,
  getRoleAggregate,
  type LevelBrowseRow,
  listReportsForRole,
} from "@fromtheloop/db";
import type { ReportFilters } from "@fromtheloop/shared";
import { AggregatePanel } from "@/components/aggregate";
import { FilterBar, Pagination, ReportList } from "@/components/reports";
import { SparseBanner } from "@/components/sparse-banner";
import { FtlBody, FtlRule } from "@/components/ui";
import { WedgeRail } from "@/components/wedge-rail";
import { routes } from "@/lib/routes";
import styles from "../browse.module.css";

export interface ResolvedRole {
  company: { id: string; slug: string; name: string };
  role: { id: string; slug: string; name: string };
}

// The role-primary browse body, shared by the role page and the level page.
//
// Position Y (the precomputed insight) is the ROLE aggregate by default — over
// every level, including the Unspecified ones — so the page is never empty just
// because reporters skipped the level field. When a level is active
// (filters.level, set either by a ?level= chip on the role page OR injected from
// the /[level] path segment), Position Y SWAPS to that level's precomputed cell
// — but only if the cell is dense enough (decideLevelView); a thin level falls
// back to the role aggregate with a sparse banner. One code path, both grains.
//
// Position X is the report list, filtered (incl. the level facet) + paginated,
// over the whole role by default. Server component; no client JS.
export async function RoleView({
  resolved,
  ladder,
  filters,
}: {
  resolved: ResolvedRole;
  ladder: LevelBrowseRow[];
  filters: ReportFilters;
}) {
  const db = getDb();
  // The role page is THE canonical base for filter/page links; a ?level= chip is
  // just another facet on it (the /[level] path renders the same state).
  const basePath = routes.companyRole(resolved.company.slug, resolved.role.slug);

  // Resolve the active level from the filter slug against the ladder. Only a
  // real, slugged level (company_levels row) can be active; a bad/Unspecified
  // slug resolves to null → the whole-role view.
  const activeLevel =
    filters.level != null
      ? (ladder.find((l) => l.slug === filters.level) ?? null)
      : null;
  const activeLevelName = activeLevel?.name ?? null;

  const cellFilters: CellReportFilters = {
    outcome: filters.outcome,
    roundType: filters.roundType,
    topics: filters.topics,
    verifiedOnly: filters.trust === "verified",
    // Narrow Position X to the active level (by its text); absent → all levels.
    level: activeLevelName ?? undefined,
  };

  // Role aggregate (always), the active level cell (only when a level is
  // active), and the filtered report page — in parallel.
  const [roleAgg, levelCell, reportPage] = await Promise.all([
    getRoleAggregate(db, {
      companyId: resolved.company.id,
      canonicalRoleId: resolved.role.id,
    }),
    activeLevelName
      ? getAggregate(db, {
          companyId: resolved.company.id,
          canonicalRoleId: resolved.role.id,
          level: activeLevelName,
        })
      : Promise.resolve(null),
    listReportsForRole(
      db,
      { companyId: resolved.company.id, canonicalRoleId: resolved.role.id },
      {
        limit: filters.perPage,
        offset: (filters.page - 1) * filters.perPage,
        filters: cellFilters,
      },
    ),
  ]);

  // Decide which precomputed aggregate Position Y shows. With a level active and
  // its cell dense → the level cell; otherwise the role aggregate (broadened
  // when a thin level forced the fallback).
  const levelDecision = activeLevel
    ? decideLevelView(levelCell?.reportCount ?? 0)
    : null;
  const showLevelCell = levelDecision?.view === "level" && levelCell != null;
  const broadened = levelDecision?.broadened ?? false;

  const positionY = showLevelCell ? levelCell : roleAgg;
  // Headline count reflects what Position Y is about.
  const headlineCount = showLevelCell
    ? levelCell.reportCount
    : (roleAgg?.reportCount ?? reportPage.total);

  const startIndex = (filters.page - 1) * filters.perPage;

  // Level facet choices = the slugged rungs of the ladder. The right rail shows
  // every rung (incl. custom/unslugged) with the active one marked.
  const levelChoices = ladder
    .filter((l) => l.slug != null)
    .map((l) => ({ slug: l.slug as string, name: l.name }));
  const railLevels = ladder.map((l) => ({
    name: l.name,
    slug: l.slug,
    reportCount: l.reportCount,
    current: l.slug != null && l.slug === activeLevel?.slug,
  }));

  return (
    <>
      <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
        {headlineCount} {headlineCount === 1 ? "report" : "reports"}
        {showLevelCell && activeLevelName ? ` at ${activeLevelName}` : ""}
      </FtlBody>
      <FtlRule />

      {/* Sparse banner — only when an active level was too thin to stand alone. */}
      {broadened && activeLevel && (
        <SparseBanner
          scope="role"
          exactCount={levelCell?.reportCount ?? 0}
          companyName={resolved.company.name}
          roleName={resolved.role.name}
          levelName={activeLevel.name}
          roleCount={roleAgg?.reportCount ?? reportPage.total}
          roleHref={basePath}
        />
      )}

      <div className={styles.wedgeMain}>
        <div className={styles.wedgeY}>
          {positionY && positionY.reportCount > 0 ? (
            <AggregatePanel aggregate={positionY} />
          ) : (
            <FtlBody tone="muted">
              Aggregated insights will appear here as reports are published.
            </FtlBody>
          )}
        </div>
        <WedgeRail
          companySlug={resolved.company.slug}
          roleSlug={resolved.role.slug}
          levels={railLevels}
        />
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Reports</h2>
        <FilterBar basePath={basePath} filters={filters} levels={levelChoices} />
        <ReportList
          items={reportPage.items}
          companyName={resolved.company.name}
          startIndex={startIndex}
        />
        {reportPage.total > 0 && (
          <p className={styles.listFoot}>
            Showing {startIndex + 1}–{startIndex + reportPage.items.length} of{" "}
            {reportPage.total}
          </p>
        )}
        <Pagination basePath={basePath} filters={filters} total={reportPage.total} />
      </section>
    </>
  );
}
