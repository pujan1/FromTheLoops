import { resolveCompany } from "@fromtheloop/core";
import {
  getCompanyStats,
  getDb,
  listReportsForCompany,
  listRolesForCompanyWithReports,
  listTopTopicsForCompany,
} from "@fromtheloop/db";
import { parseReportFilters } from "@fromtheloop/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { Breadcrumb } from "@/components/breadcrumb";
import styles from "../browse.module.css";

type Params = Promise<{ company: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { company } = await params;
  const resolved = await resolveCompany(getDb(), company);
  if (!resolved) return { title: "Not found — FromTheLoop" };
  return {
    title: `${resolved.company.name} interviews — FromTheLoop`,
    description: `Recent interview reports at ${resolved.company.name}, across every role — filter by outcome or jump to a role.`,
    alternates: { canonical: routes.company(resolved.company.slug) },
  };
}

// /companies/[company] — the all-roles surface. A recent-reports feed across
// EVERY role (so a report whose level was skipped, or whose role you didn't
// think to drill into, is still seen), plus role navigation to the per-role
// aggregate pages. Feed filters in place by outcome; level lives on the role
// page (an SDE 'L4' ≠ a Data Engineer 'L4'). Fully SSR.
export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { company } = await params;
  const db = getDb();
  const resolved = await resolveCompany(db, company);
  if (!resolved) notFound();

  const filters = parseReportFilters(await searchParams);
  const basePath = routes.company(resolved.company.slug);

  const [stats, rolesList, topTopics, feed] = await Promise.all([
    getCompanyStats(db, resolved.company.id),
    listRolesForCompanyWithReports(db, resolved.company.id),
    // Top tags at this company — the Sprint 5 rollup content; each links to the
    // topic×company leaf. Capped at a single chip row's worth.
    listTopTopicsForCompany(db, resolved.company.id, 12),
    listReportsForCompany(db, resolved.company.id, {
      limit: filters.perPage,
      offset: (filters.page - 1) * filters.perPage,
      // Outcome is the only in-place facet on the company feed.
      filters: { outcome: filters.outcome },
    }),
  ]);

  const startIndex = (filters.page - 1) * filters.perPage;

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <Breadcrumb
            items={[
              { label: "Companies", href: routes.companies },
              { label: resolved.company.name },
            ]}
          />
          <FtlEyebrow tone="accent">company</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {resolved.company.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {stats.reportCount > 0
              ? `${stats.reportCount} ${
                  stats.reportCount === 1 ? "report" : "reports"
                } across ${stats.roleCount} ${
                  stats.roleCount === 1 ? "role" : "roles"
                }.`
              : "No published reports for this company yet."}
          </FtlBody>

          {rolesList.length > 0 && (
            <nav className={styles.roleNav} aria-label="Roles">
              {rolesList.map((r) => (
                <Link
                  key={r.id}
                  className={styles.roleNav__item}
                  href={routes.companyRole(resolved.company.slug, r.slug)}
                >
                  {r.name}
                  <span className={styles.roleNav__count}>{r.reportCount}</span>
                </Link>
              ))}
            </nav>
          )}

          {topTopics.length > 0 && (
            <div className={styles.tagSection}>
              <h2 className={styles.sectionTitle}>Top topics</h2>
              <nav className={styles.roleNav} aria-label="Top topics">
                {topTopics.map((t) => (
                  <Link
                    key={t.slug}
                    className={styles.roleNav__item}
                    href={routes.topicCompany(t.slug, resolved.company.slug)}
                  >
                    {t.name}
                    <span className={styles.roleNav__count}>
                      {t.reportCount}
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          )}

          <FtlRule />

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent reports</h2>
            <FilterBar
              basePath={basePath}
              filters={filters}
              showRound={false}
              showTrust={false}
            />
            <ReportList
              items={feed.items}
              companyName={resolved.company.name}
              startIndex={startIndex}
            />
            {feed.total > 0 && (
              <p className={styles.listFoot}>
                Showing {startIndex + 1}–{startIndex + feed.items.length} of{" "}
                {feed.total}
              </p>
            )}
            <Pagination basePath={basePath} filters={filters} total={feed.total} />
          </section>
        </FtlContainer>
      </main>
    </>
  );
}
