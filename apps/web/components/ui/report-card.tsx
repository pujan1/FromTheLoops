import { Tag } from "./tag";
import styles from "./report-card.module.css";

export type ReportCardProps = {
  index?: string;            // e.g. "01"
  company: string;
  role: string;
  level: string;
  title: string;             // editorial headline ("A two-week loop, in four acts")
  excerpt: string;
  rounds: number;
  topics: string[];          // up to ~3 displayed
  verified?: boolean;        // work-email verified contributor
  postedAt: string;          // already-formatted display string ("2 days ago")
  href?: string;
};

export function ReportCard({
  index,
  company,
  role,
  level,
  title,
  excerpt,
  rounds,
  topics,
  verified = false,
  postedAt,
  href = "#",
}: ReportCardProps) {
  return (
    <a className={styles.report} href={href}>
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
        <p className={styles.report__excerpt}>{excerpt}</p>

        <div className={styles.report__tags}>
          {topics.slice(0, 3).map((t) => (
            <Tag key={t} variant="ghost">{t}</Tag>
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
