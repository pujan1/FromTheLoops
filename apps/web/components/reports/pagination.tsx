import {
  buildReportFiltersQuery,
  type ReportFilters,
} from "@fromtheloop/shared";
import styles from "./reports.module.css";

// SSR pagination for the report list. Renders plain <a> links so a page is a
// real, crawlable URL and the control works without JS — the wedge page reads
// ?page= back out via parseReportFilters. Every link preserves the active
// filters by rebuilding the whole query string with the page swapped (page 1
// drops the param, so it points at the clean canonical URL).

// Build the windowed list of page numbers to show: first, last, current±1, with
// `"gap"` sentinels where pages are elided. Keeps the control to a fixed width
// regardless of how many pages exist.
function pageWindow(current: number, totalPages: number): (number | "gap")[] {
  const pages = new Set<number>([1, totalPages, current]);
  if (current - 1 >= 1) pages.add(current - 1);
  if (current + 1 <= totalPages) pages.add(current + 1);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

export function Pagination({
  basePath,
  filters,
  total,
}: {
  basePath: string;
  filters: ReportFilters;
  total: number;
}) {
  const totalPages = Math.ceil(total / filters.perPage);
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(filters.page, 1), totalPages);
  const href = (page: number) =>
    `${basePath}${buildReportFiltersQuery({ ...filters, page })}`;

  const prevDisabled = current <= 1;
  const nextDisabled = current >= totalPages;

  return (
    <nav className={styles.pager} aria-label="Report list pages">
      {prevDisabled ? (
        <span
          className={`${styles.pager__link} ${styles.pager__end} ${styles["pager__end--disabled"]}`}
          aria-disabled="true"
        >
          ‹ Prev
        </span>
      ) : (
        <a
          className={`${styles.pager__link} ${styles.pager__end}`}
          href={href(current - 1)}
          rel="prev"
        >
          ‹ Prev
        </a>
      )}

      {pageWindow(current, totalPages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className={styles.pager__gap} aria-hidden="true">
            …
          </span>
        ) : p === current ? (
          <span key={p} className={styles.pager__current} aria-current="page">
            {p}
          </span>
        ) : (
          <a key={p} className={styles.pager__link} href={href(p)}>
            {p}
          </a>
        ),
      )}

      {nextDisabled ? (
        <span
          className={`${styles.pager__link} ${styles.pager__end} ${styles["pager__end--disabled"]}`}
          aria-disabled="true"
        >
          Next ›
        </span>
      ) : (
        <a
          className={`${styles.pager__link} ${styles.pager__end}`}
          href={href(current + 1)}
          rel="next"
        >
          Next ›
        </a>
      )}
    </nav>
  );
}
