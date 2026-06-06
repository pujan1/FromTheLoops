import { resolveWedge } from "@fromtheloop/core";
import {
  type CellReportFilters,
  getAggregate,
  getDb,
  listReportsForCell,
} from "@fromtheloop/db";
import { parseReportFilters } from "@fromtheloop/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AggregatePanel } from "@/components/aggregate";
import { FilterBar, Pagination, ReportList } from "@/components/reports";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { Breadcrumb } from "../../../_components/breadcrumb";
import styles from "../../../browse.module.css";

type Params = Promise<{ company: string; role: string; level: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Translate the URL filter state into the db read's predicate. `trust=verified`
// becomes the verified-only floor; the rest map straight across.
function toCellFilters(
  filters: ReturnType<typeof parseReportFilters>,
): CellReportFilters {
  return {
    outcome: filters.outcome,
    roundType: filters.roundType,
    topics: filters.topics,
    verifiedOnly: filters.trust === "verified",
  };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { company, role, level } = await params;
  const resolved = await resolveWedge(getDb(), company, role, level);
  if (!resolved) return { title: "Not found — FromTheLoop" };
  const title = `${resolved.company.name} · ${resolved.role.name} · ${resolved.level.name}`;
  return {
    title: `${title} interviews — FromTheLoop`,
    description: `Aggregated interview insights and reports for ${resolved.role.name} (${resolved.level.name}) at ${resolved.company.name}.`,
    // Filtered/paginated variants all canonicalize to the bare wedge URL so the
    // crawler indexes one page, not a combinatorial explosion of filter states.
    alternates: {
      canonical: routes.wedge(
        resolved.company.slug,
        resolved.role.slug,
        resolved.level.slug,
      ),
    },
  };
}

// /companies/[company]/[role]/[level] — THE canonical wedge page.
//   Position Y (AggregatePanel): the cell's precomputed aggregate — unfiltered,
//     it's the insight for the whole cell.
//   Position X (FilterBar + ReportList + Pagination): the report list, filtered
//     + paginated entirely via URL query params (parsed with Zod), fully SSR —
//     no client-side data fetch, every filter/page state a real URL.
export default async function WedgePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { company, role, level } = await params;
  const db = getDb();
  const resolved = await resolveWedge(db, company, role, level);
  if (!resolved) notFound();

  const filters = parseReportFilters(await searchParams);
  const basePath = routes.wedge(
    resolved.company.slug,
    resolved.role.slug,
    resolved.level.slug,
  );

  const [aggregate, reportPage] = await Promise.all([
    getAggregate(db, resolved.cell),
    listReportsForCell(db, resolved.cell, {
      limit: filters.perPage,
      offset: (filters.page - 1) * filters.perPage,
      filters: toCellFilters(filters),
    }),
  ]);

  // H1 count is the cell's full size (from the aggregate), independent of the
  // active filters; the list foot reports the filtered subset.
  const reportCount = aggregate?.reportCount ?? reportPage.total;
  const startIndex = (filters.page - 1) * filters.perPage;

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <Breadcrumb
            items={[
              { label: "Companies", href: routes.companies },
              {
                label: resolved.company.name,
                href: routes.company(resolved.company.slug),
              },
              {
                label: resolved.role.name,
                href: routes.companyRole(
                  resolved.company.slug,
                  resolved.role.slug,
                ),
              },
              { label: resolved.level.name },
            ]}
          />
          <FtlEyebrow tone="accent">interview reports</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {resolved.company.name} · {resolved.role.name} ·{" "}
            {resolved.level.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {reportCount} {reportCount === 1 ? "report" : "reports"}
          </FtlBody>
          <FtlRule />

          {/* Position Y — aggregated insights for the whole cell. */}
          {aggregate && aggregate.reportCount > 0 ? (
            <section className={styles.section}>
              <AggregatePanel aggregate={aggregate} />
            </section>
          ) : (
            <FtlBody tone="muted">
              Aggregated insights will appear here as reports are published.
            </FtlBody>
          )}

          {/* Position X — filterable, paginated report list. */}
          <section className={styles.section}>
            <p className={styles.sectionTitle}>Reports</p>
            <FilterBar basePath={basePath} filters={filters} />
            <ReportList
              items={reportPage.items}
              companyName={resolved.company.name}
              roleName={resolved.role.name}
              startIndex={startIndex}
            />
            {reportPage.total > 0 && (
              <p className={styles.listFoot}>
                Showing {startIndex + 1}–{startIndex + reportPage.items.length} of{" "}
                {reportPage.total}
              </p>
            )}
            <Pagination
              basePath={basePath}
              filters={filters}
              total={reportPage.total}
            />
          </section>
        </FtlContainer>
      </main>
    </>
  );
}
