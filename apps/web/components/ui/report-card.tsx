import type { ReactNode } from "react";
import { FtlTag } from "./tag";
import styles from "./report-card.module.css";

export type ReportCardProps = {
  index?: string;            // e.g. "01"
  company: string;
  role: string;
  level: string;
  title: string;             // editorial headline ("A two-week loop, in four acts")
  excerpt: string;
  // Rich excerpt override (e.g. a search snippet with matched terms wrapped in
  // <mark>). When set it replaces the plain `excerpt` text. Pass pre-built React
  // nodes only — never raw HTML — so user prose can't inject markup.
  excerptNode?: ReactNode;
  rounds: number;
  topics: string[];          // up to ~3 displayed
  verified?: boolean;        // work-email verified contributor
  postedAt: string;          // already-formatted display string ("2 days ago")
  href?: string;
  // ADR-0010: marks the row currently open in the triage preview pane, so the
  // master list shows which report the pane reflects. Purely presentational.
  active?: boolean;
};

export function FtlReportCard({
  index,
  company,
  role,
  level,
  title,
  excerpt,
  excerptNode,
  rounds,
  topics,
  verified = false,
  postedAt,
  href = "#",
  active = false,
}: ReportCardProps) {
  return (
    <a
      className={`${styles.report} ${active ? styles["report--active"] : ""}`}
      href={href}
      aria-current={active ? "true" : undefined}
    >
      {index && <span className={styles.report__index}>{index}</span>}

      <div className={styles.report__body}>
        <div className={styles.report__meta}>
          <span>{company}</span>
          <span className={styles.report__meta__sep} aria-hidden="true" />
          <span>{role}</span>
          <span className={styles.report__meta__sep} aria-hidden="true" />
          <span>{level}</span>
          <span className={styles.report__meta__sep} aria-hidden="true" />
          <span>{postedAt}</span>
          {verified && (
            <>
              <span className={styles.report__meta__sep} aria-hidden="true" />
              <span className={styles.report__meta__verified}>
                <span aria-hidden="true">●</span> verified
              </span>
            </>
          )}
        </div>

        <h3 className={styles.report__title}>{title}</h3>
        <p className={styles.report__excerpt}>{excerptNode ?? excerpt}</p>

        <div className={styles.report__tags}>
          {topics.slice(0, 3).map((t) => (
            <FtlTag key={t} variant="ghost">{t}</FtlTag>
          ))}
        </div>
      </div>

      <div className={styles.report__aside}>
        <span className={styles.report__aside__rounds}>{rounds}</span>
        <span className={styles.report__aside__label}>rounds</span>
      </div>

      <span className={styles.report__chev} aria-hidden="true">→</span>
    </a>
  );
}
