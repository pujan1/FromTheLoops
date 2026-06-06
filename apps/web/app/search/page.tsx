import { searchReports } from "@fromtheloop/search";
import { parseReportFilters } from "@fromtheloop/shared";
import type { Metadata } from "next";
import { FilterBar, Pagination, SearchResults } from "@/components/reports";
import {
  FtlBody,
  FtlContainer,
  FtlEyebrow,
  FtlRule,
  FtlSearchBar,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import styles from "./search.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// A results page is per-query and thin — it must never compete with the
// canonical wedge pages for index space. noindex,follow: don't index the page,
// but do let the crawler follow links out to the real pages.
export const metadata: Metadata = {
  title: "Search — FromTheLoop",
  robots: { index: false, follow: true },
};

// True when any facet (not the free-text query) is engaged. With no query AND
// no facets we show a prompt instead of dumping every report.
function hasActiveFacets(filters: ReturnType<typeof parseReportFilters>): boolean {
  return (
    Boolean(filters.outcome) ||
    Boolean(filters.roundType) ||
    filters.topics.length > 0 ||
    filters.trust !== "all"
  );
}

// /search — global full-text + faceted results over the Typesense `reports`
// index. Query + facets + page all live in the URL (?q=&outcome=&page=…), parsed
// with the shared report-filters schema, so the page is fully SSR and every
// result state is a real shareable URL. The header search box and the
// in-page FilterBar both submit here.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters = parseReportFilters(await searchParams);
  const query = filters.q;
  const shouldSearch = query.length > 0 || hasActiveFacets(filters);

  const result = shouldSearch
    ? await searchReports({
        q: query,
        filters: {
          outcome: filters.outcome,
          roundType: filters.roundType,
          topics: filters.topics,
          verifiedOnly: filters.trust === "verified",
        },
        page: filters.page,
        perPage: filters.perPage,
      })
    : null;

  const startIndex = (filters.page - 1) * filters.perPage;

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <FtlEyebrow tone="accent">search</FtlEyebrow>
          <div className={styles.searchHead}>
            <FtlSearchBar defaultValue={query} size="large" autoFocus={!query} />
          </div>

          {result ? (
            <>
              <FtlBody size="lead" tone="muted" className={styles.summary}>
                {result.found > 0 ? (
                  <>
                    {result.found} {result.found === 1 ? "report" : "reports"}
                    {query && (
                      <>
                        {" "}
                        for <span className={styles.term}>“{query}”</span>
                      </>
                    )}{" "}
                    <span className={styles.timing}>
                      · {result.searchTimeMs}ms
                    </span>
                  </>
                ) : (
                  <>
                    No reports{query && <> for “{query}”</>}. Try a broader term or
                    fewer filters.
                  </>
                )}
              </FtlBody>
              <FtlRule />

              <FilterBar basePath={routes.search} filters={filters} />

              {result.found > 0 ? (
                <>
                  <SearchResults hits={result.hits} startIndex={startIndex} />
                  <Pagination
                    basePath={routes.search}
                    filters={filters}
                    total={result.found}
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <FtlRule />
              <FtlBody size="lead" tone="muted" className={styles.prompt}>
                Search across every interview report — by company, role, topic, or
                anything in the write-ups.
              </FtlBody>
            </>
          )}
        </FtlContainer>
      </main>
    </>
  );
}
