import type { AggregateTopTopic } from "@fromtheloop/db";
import { routes } from "@/lib/routes";
import styles from "./aggregate.module.css";

// Position-Y top topics: the most-asked-about topics in this cell, as chips that
// link to /topics/[slug]. `count` is occurrences across the cell's reports.
// Server component.

export function TopTopics({ topics }: { topics: AggregateTopTopic[] }) {
  if (topics.length === 0) return null;

  return (
    <div className={styles.block}>
      <p className={styles.block__label}>Top topics</p>
      <div className={styles.topics}>
        {topics.map((t) => (
          <a key={t.slug} href={routes.topic(t.slug)} className={styles.topic}>
            <span>{t.name}</span>
            <span className={styles.topic__count}>×{t.count}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
