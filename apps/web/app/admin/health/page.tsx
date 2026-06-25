// /admin/health (Sprint 3 Day 8) — the aggregation-lag dashboard. Surfaces the
// three numbers that tell an admin whether the invisible pipeline is keeping up:
//
//   1. Queue depth — how many events the aggregate + search consumers still owe
//      (countUnprocessed*Events). Healthy = near zero; a growing number means
//      the worker is down or wedged.
//   2. Last refresh per cell — the freshest aggregate rows, so you can see the
//      pipeline actually writing.
//   3. Typesense doc counts — per collection, to spot index/DB drift.
//
// Gated by requireAdmin() (allowlist; 404 for non-admins). force-dynamic: these
// are live operational metrics, never cached.

import {
  collectionDocCounts,
  ALL_COLLECTIONS,
} from "@fromtheloop/search";
import {
  countAggregateCells,
  countUnprocessedAggregateEvents,
  countUnprocessedSearchEvents,
  getDb,
  listRecentAggregateRefreshes,
} from "@fromtheloop/db";
import { requireAdmin } from "../../../lib/admin";
import { relativeTime } from "@/lib/format";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  await requireAdmin();

  const db = getDb();
  // Fan the reads out — they're independent. Doc counts degrade to 0 if
  // Typesense is unreachable (collectionDocCounts swallows per-collection).
  const [aggLag, searchLag, cellCount, recent, docCounts] = await Promise.all([
    countUnprocessedAggregateEvents(db),
    countUnprocessedSearchEvents(db),
    countAggregateCells(db),
    listRecentAggregateRefreshes(db, 20),
    collectionDocCounts(),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>admin · health</p>
        <h1 className={styles.title}>Aggregation pipeline</h1>
        <p className={styles.sub}>
          Live queue depth, aggregate freshness, and search index counts. A
          healthy worker keeps the lag numbers near zero.
        </p>
      </header>

      <section className={styles.metrics} aria-label="Queue depth">
        <Metric
          label="Aggregate lag"
          value={aggLag}
          hint="events awaiting refresh"
          warn={aggLag > 0}
        />
        <Metric
          label="Search lag"
          value={searchLag}
          hint="events awaiting indexing"
          warn={searchLag > 0}
        />
        <Metric label="Aggregate cells" value={cellCount} hint="live (company·role·level)" />
      </section>

      <section aria-label="Typesense collections">
        <h2 className={styles.h2}>Typesense documents</h2>
        <div className={styles.metrics}>
          {ALL_COLLECTIONS.map((c) => (
            <Metric
              key={c.name}
              label={c.name}
              value={docCounts[c.name] ?? 0}
              hint="indexed docs"
            />
          ))}
        </div>
      </section>

      <section aria-label="Recent aggregate refreshes">
        <h2 className={styles.h2}>Recently refreshed cells</h2>
        {recent.length === 0 ? (
          <p className={styles.empty}>
            No aggregate cells yet. Reports become visible (and aggregate) once
            moderation promotes them to <code>active</code>.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Level</th>
                <th className={styles.num}>Reports</th>
                <th className={styles.num}>Refreshed</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={`${r.companyName}-${r.roleName}-${r.level}-${i}`}>
                  <td>{r.companyName}</td>
                  <td>{r.roleName}</td>
                  <td>{r.level}</td>
                  <td className={styles.num}>{r.reportCount}</td>
                  <td className={styles.num} title={r.refreshedAt.toISOString()}>
                    {relativeTime(r.refreshedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
  warn = false,
}: {
  label: string;
  value: number;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={`${styles.metricValue} ${warn ? styles.metricWarn : ""}`}>
        {value.toLocaleString()}
      </span>
      <span className={styles.metricHint}>{hint}</span>
    </div>
  );
}
