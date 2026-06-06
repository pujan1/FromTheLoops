import { routes } from "@/lib/routes";
import styles from "./wedge-rail.module.css";

// The wedge page's right rail (Sprint 4 wireframe). Two stacked cards:
//  1. A salary-range CTA placeholder — comp data is post-V1, but the slot earns
//     its keep now by funnelling "share yours" submissions (the data flywheel).
//  2. Related levels — the sibling rungs of this (company, role) ladder, so a
//     visitor who landed on the wrong level can jump sideways. The current level
//     is shown but inert.
// Server component; no client JS. On mobile it drops below Position Y.

export interface RailLevel {
  name: string;
  slug: string | null;
  reportCount: number;
  current: boolean;
}

export function WedgeRail({
  companySlug,
  roleSlug,
  levels,
}: {
  companySlug: string;
  roleSlug: string;
  levels: RailLevel[];
}) {
  return (
    <aside className={styles.rail} aria-label="Related and actions">
      <div className={styles.card}>
        <p className={styles.card__label}>Compensation</p>
        <p className={styles.card__lede}>Salary ranges are coming soon.</p>
        <p className={styles.card__note}>
          Got an offer at this level? Add the numbers and help the next
          candidate negotiate.
        </p>
        <a className={styles.cta} href={routes.submit}>
          Share yours
          <span aria-hidden="true"> →</span>
        </a>
      </div>

      {levels.length > 0 && (
        <div className={styles.card}>
          <p className={styles.card__label}>Other levels</p>
          <ul className={styles.levels}>
            {levels.map((lvl) => {
              const meta = `${lvl.reportCount}`;
              if (lvl.current) {
                return (
                  <li
                    key={lvl.name}
                    className={`${styles.level} ${styles["level--current"]}`}
                    aria-current="true"
                  >
                    <span className={styles.level__name}>{lvl.name}</span>
                    <span className={styles.level__meta}>{meta}</span>
                  </li>
                );
              }
              // A custom level (no company_levels slug) has no canonical URL.
              if (!lvl.slug) {
                return (
                  <li
                    key={lvl.name}
                    className={`${styles.level} ${styles["level--nolink"]}`}
                  >
                    <span className={styles.level__name}>{lvl.name}</span>
                    <span className={styles.level__meta}>{meta}</span>
                  </li>
                );
              }
              return (
                <li key={lvl.name}>
                  <a
                    className={styles.level}
                    href={routes.wedge(companySlug, roleSlug, lvl.slug)}
                  >
                    <span className={styles.level__name}>{lvl.name}</span>
                    <span className={styles.level__meta}>{meta}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
