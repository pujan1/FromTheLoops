import {
  buildReportFiltersQuery,
  REPORT_OUTCOMES,
  REPORT_TRUST_TIERS,
  type ReportFilters,
  ROUND_TYPES,
} from "@fromtheloop/shared";
import { OUTCOME_LABEL, roundTypeLabel } from "@/lib/labels";
import styles from "./reports.module.css";

// Position-X filter bar. Link-based chips, not a client form: each chip is an
// <a> to the same page with one facet toggled, so filtering is fully SSR, works
// without JS, and every filter state is a real (crawlable, shareable) URL the
// wedge page reads back via parseReportFilters. Changing any facet resets to
// page 1. Server component.
//
// Facets: outcome, round-type, trust-tier (the enumerable ones). Active topic
// filters (set by clicking a Position-Y topic chip → ?topics=) render as
// removable chips so that state is visible and reversible too.

const TRUST_LABEL: Record<(typeof REPORT_TRUST_TIERS)[number], string> = {
  all: "All",
  verified: "Verified",
};

export function FilterBar({
  basePath,
  filters,
}: {
  basePath: string;
  filters: ReportFilters;
}) {
  // Build the href for a filter state, always resetting to page 1.
  const href = (next: Partial<ReportFilters>) =>
    `${basePath}${buildReportFiltersQuery({ ...filters, ...next, page: 1 })}`;

  function Chip({
    label,
    active,
    target,
  }: {
    label: string;
    active: boolean;
    target: Partial<ReportFilters>;
  }) {
    return (
      <a
        className={`${styles.chip} ${active ? styles["chip--active"] : ""}`}
        href={href(target)}
        aria-pressed={active}
      >
        {label}
      </a>
    );
  }

  return (
    <div className={styles.filters}>
      <div className={styles.facet}>
        <span className={styles.facet__label}>Outcome</span>
        <div className={styles.chips}>
          <Chip label="All" active={!filters.outcome} target={{ outcome: undefined }} />
          {REPORT_OUTCOMES.map((o) => (
            <Chip
              key={o}
              label={OUTCOME_LABEL[o]}
              active={filters.outcome === o}
              target={{ outcome: o }}
            />
          ))}
        </div>
      </div>

      <div className={styles.facet}>
        <span className={styles.facet__label}>Round</span>
        <div className={styles.chips}>
          <Chip label="All" active={!filters.roundType} target={{ roundType: undefined }} />
          {ROUND_TYPES.map((rt) => (
            <Chip
              key={rt}
              label={roundTypeLabel(rt)}
              active={filters.roundType === rt}
              target={{ roundType: rt }}
            />
          ))}
        </div>
      </div>

      <div className={styles.facet}>
        <span className={styles.facet__label}>Trust</span>
        <div className={styles.chips}>
          {REPORT_TRUST_TIERS.map((t) => (
            <Chip
              key={t}
              label={TRUST_LABEL[t]}
              active={filters.trust === t}
              target={{ trust: t }}
            />
          ))}
        </div>
      </div>

      {filters.topics.length > 0 && (
        <div className={styles.facet}>
          <span className={styles.facet__label}>Topics</span>
          <div className={styles.chips}>
            {filters.topics.map((slug) => (
              <a
                key={slug}
                className={`${styles.chip} ${styles["chip--active"]}`}
                href={href({ topics: filters.topics.filter((s) => s !== slug) })}
                aria-label={`Remove topic filter ${slug}`}
              >
                {slug}
                <span className={styles.chip__remove} aria-hidden="true">
                  ×
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
