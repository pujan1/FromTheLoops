import styles from "@/components/sparse-banner.module.css";

const report = (n: number) => (n === 1 ? "report" : "reports");

// The topic×company sparse banner (Sprint 5) — the topic-axis analogue of the
// wedge's SparseBanner. Shown when the (topic, company) cell is below the
// SPARSE_REPORT_THRESHOLD: the page has broadened to the topic across every
// company, and this is the honest caveat saying so + the link back to the
// narrow cell's parent (the topic page). Reuses the shared banner styling.
export function TopicSparseBanner({
  exactCount,
  topicName,
  companyName,
  topicCount,
  topicHref,
}: {
  // Distinct reports at the company for this topic (what made the cell thin).
  exactCount: number;
  topicName: string;
  companyName: string;
  // Distinct reports for the topic across all companies (the broadened corpus).
  topicCount: number;
  topicHref: string;
}) {
  return (
    <aside className={styles.banner} role="note">
      <span className={styles.bar} aria-hidden="true" />
      <div className={styles.body}>
        <p className={styles.label}>Small sample</p>
        <p className={styles.text}>
          {exactCount === 0 ? (
            <>
              No {companyName} {report(1)} mention <strong>{topicName}</strong>{" "}
              yet.
            </>
          ) : (
            <>
              Only{" "}
              <strong>
                {exactCount} {report(exactCount)}
              </strong>{" "}
              at {companyName} touch <strong>{topicName}</strong>.
            </>
          )}{" "}
          Showing {topicName} across every company so the questions below come
          from a fuller sample.
        </p>
        <a className={styles.link} href={topicHref}>
          See all {topicCount} {topicName} {report(topicCount)}
          <span aria-hidden="true"> →</span>
        </a>
      </div>
    </aside>
  );
}
