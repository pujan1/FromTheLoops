import {
  getDb,
  listRecentReportIds,
  listRecentReports,
} from "@fromtheloop/db";
import { parseReportFilters } from "@fromtheloop/shared";
import type { Metadata } from "next";
import { FilterBar } from "@/components/reports";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSearchBar,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { TRIAGE_ID_CAP } from "@/lib/triage";
import { ReportTriage } from "../companies/_components/report-triage";
import styles from "../companies/browse.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Interview experiences — FromTheLoop",
  description:
    "Every interview experience across the index — most helpful first. Filter by outcome, round type, or trust, or search for a company, role, or topic.",
  alternates: { canonical: routes.reports },
};

// /reports — the global experience feed. Every visible report across all
// companies and roles, ordered helpful-first with a recency tiebreak (same
// order as the scoped feeds), filterable in place and previewable via the
// ADR-0010 triage pane. Facets + page live in the URL (?outcome=&page=…), so
// the page is fully SSR and every state is a shareable address. The header
// search box and the search CTA hand off the free-text path to /search.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters = parseReportFilters(await searchParams);
  const basePath = routes.reports;

  const feedFilters = {
    outcome: filters.outcome,
    roundType: filters.roundType,
    topics: filters.topics,
    verifiedOnly: filters.trust === "verified",
  };

  const [feed, orderedIds] = await Promise.all([
    listRecentReports(getDb(), {
      limit: filters.perPage,
      offset: (filters.page - 1) * filters.perPage,
      filters: feedFilters,
    }),
    // Full ordered ID list (same scope + filter) feeding the triage pane, which
    // walks the WHOLE feed rather than just the visible page.
    listRecentReportIds(getDb(), { filters: feedFilters, cap: TRIAGE_ID_CAP }),
  ]);

  const startIndex = (filters.page - 1) * filters.perPage;

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="wide">
          <FtlEyebrow tone="accent">experiences</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            Interview experiences
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {feed.total > 0
              ? `${feed.total} ${
                  feed.total === 1 ? "experience" : "experiences"
                } across the index — most helpful first.`
              : "No published experiences yet."}
          </FtlBody>

          <div style={{ marginTop: 24, maxWidth: 560 }}>
            <FtlSearchBar size="large" />
          </div>

          <FtlRule />

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent</h2>
            <FilterBar basePath={basePath} filters={filters} />
            {/* Master-detail triage (ADR-0010): a row click previews in-pane on
                desktop / a bottom sheet on mobile; the per-report SSR page stays
                the canonical address + no-JS fallback. companyName omitted — this
                is a cross-company feed, so each row carries its own company. */}
            <ReportTriage
              items={feed.items}
              orderedIds={orderedIds}
              startIndex={startIndex}
              basePath={basePath}
              filters={filters}
              total={feed.total}
              emptyMessage="No experiences match these filters."
            />
          </section>
        </FtlContainer>
      </main>
    </>
  );
}
