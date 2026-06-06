import type { CompanyRoleLevelAggregate } from "@fromtheloop/db";
import { OUTCOME_LABEL } from "@/lib/labels";
import styles from "./aggregate.module.css";

// Position-Y outcome distribution: one stacked proportional bar + a legend.
// Reads the aggregate's per-outcome counts (NULL-outcome reports are excluded
// upstream, so the segments sum to ≤ reportCount). Server component.

type Outcome = keyof CompanyRoleLevelAggregate["outcome"];

// Reading order of the segments (best → worst → neutral), independent of the
// label map's key order.
const ORDER: Outcome[] = ["offer", "reject", "ghosted", "withdrew", "pending"];

export function OutcomeBars({
  outcome,
}: {
  outcome: CompanyRoleLevelAggregate["outcome"];
}) {
  const total = ORDER.reduce((sum, k) => sum + outcome[k], 0);
  if (total === 0) return null;

  const segments = ORDER.filter((k) => outcome[k] > 0);

  return (
    <div className={styles.block}>
      <p className={styles.block__label}>Outcome distribution</p>

      <div
        className={styles.bar}
        role="img"
        aria-label={segments
          .map((k) => `${outcome[k]} ${OUTCOME_LABEL[k].toLowerCase()}`)
          .join(", ")}
      >
        {segments.map((k) => (
          <span
            key={k}
            className={`${styles.bar__seg} ${styles[`bar__seg--${k}`]}`}
            style={{ width: `${(outcome[k] / total) * 100}%` }}
          />
        ))}
      </div>

      <ul className={styles.legend}>
        {ORDER.map((k) => (
          <li key={k} className={styles.legend__item}>
            <span
              className={`${styles.legend__swatch} ${styles[`legend__swatch--${k}`]}`}
              aria-hidden="true"
            />
            <span className={styles.legend__name}>{OUTCOME_LABEL[k]}</span>
            <span className={styles.legend__count}>{outcome[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
