import { roundTypeLabel } from "@/lib/labels";
import styles from "./aggregate.module.css";

// Position-Y round structure: the median round count + the modal round sequence
// rendered as a numbered ladder (① recruiter-screen → ② onsite-coding → …).
// `modeRoundSequence` is the most common ordered round-type list across the
// cell's reports. Server component.

export function RoundStructure({
  medianRoundCount,
  modeRoundSequence,
}: {
  medianRoundCount: number | null;
  modeRoundSequence: string[] | null;
}) {
  const hasSequence = modeRoundSequence && modeRoundSequence.length > 0;
  if (medianRoundCount === null && !hasSequence) return null;

  return (
    <div className={styles.block}>
      <p className={styles.block__label}>
        Common round structure
        {medianRoundCount !== null && (
          <span className={styles.block__label__meta}>
            median {medianRoundCount}{" "}
            {medianRoundCount === 1 ? "round" : "rounds"}
          </span>
        )}
      </p>

      {hasSequence && (
        <ol className={styles.sequence}>
          {modeRoundSequence.map((rt, i) => (
            <li key={`${rt}-${i}`} className={styles.step}>
              {i > 0 && (
                <span className={styles.step__sep} aria-hidden="true">
                  →
                </span>
              )}
              <span className={styles.step__num} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.step__name}>{roundTypeLabel(rt)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
