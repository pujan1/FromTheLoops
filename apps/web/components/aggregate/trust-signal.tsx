import styles from "./aggregate.module.css";

// Position-Y trust signal: the trust-weighted count vs the raw report count.
// Verified reports weigh 1.0, unverified 0.3 (the live V1 mapping), so the
// weighted figure sits below the raw count whenever any report is unverified —
// the gap is the point. Server component.

export function TrustSignal({
  trustWeightedCount,
  reportCount,
}: {
  trustWeightedCount: number;
  reportCount: number;
}) {
  return (
    <div className={styles.block}>
      <p className={styles.block__label}>Trust-weighted signal</p>
      <div className={styles.trust}>
        <span className={styles.trust__value}>
          {trustWeightedCount.toFixed(1)}
        </span>
        <span className={styles.trust__of}>
          weighted of {reportCount} {reportCount === 1 ? "report" : "reports"}
        </span>
      </div>
      <p className={styles.trust__note}>
        Verified contributors count more than unverified ones, so this weighs the
        signal rather than the raw volume.
      </p>
    </div>
  );
}
