// Auto-approve audit view (Sprint 6 Day 8). The heuristic promotes low-risk
// pending taxonomy without a moderator — this is the spot-check surface that
// keeps that honest: every system auto-approval from the last 24h, newest-first,
// with the signals that fired and a deep-link into the entity's full audit
// history (where a human can reverse it if the heuristic got it wrong). Gated by
// requireModerator() (the admin layout also gates; defence-in-depth).

import Link from "next/link";
import { getDb, listAutoApprovals } from "@fromtheloop/db";
import { requireModerator } from "@/lib/admin";
import { absoluteTime, relativeTime } from "@/lib/format";
import styles from "../audit/page.module.css";

export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  "verified-submitter": "verified submitter",
  "name-ok": "clean name",
  "no-near-duplicate": "no near-duplicate",
};

export default async function AutoApprovePage() {
  await requireModerator();

  const db = getDb();
  const entries = await listAutoApprovals(db);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Auto-approved (24h)</h1>
          <p className={styles.desc}>
            Pending companies and tags the heuristic promoted automatically — trusted submitter, clean name,
            no near-duplicate. Spot-check these; open an entity to reverse it if it&apos;s wrong.
          </p>
        </div>
        <span className={styles.count}>{entries.length} entries</span>
      </header>

      {entries.length === 0 ? (
        <p className={styles.empty}>Nothing auto-approved in the last 24 hours.</p>
      ) : (
        <ol className={styles.feed}>
          {entries.map((e) => (
            <li key={e.id} className={styles.row}>
              <span className={`${styles.dot} ${styles["dot--good"]}`} aria-hidden />
              <div className={styles.body}>
                <p className={styles.line}>
                  <span className={`${styles.verb} ${styles["verb--good"]}`}>Auto-approved</span>{" "}
                  a <span className={styles.target}>{e.targetType}</span>{" "}
                  <Link
                    href={`/admin/audit?type=${e.targetType}&id=${e.targetId}`}
                    className={styles.idLink}
                    title="See this entity's full history"
                  >
                    {e.name ?? e.targetId.slice(0, 8)}
                  </Link>
                </p>
                {e.reasons.length > 0 && (
                  <p className={styles.meta}>
                    {e.reasons.map((r) => REASON_LABEL[r] ?? r).join(" · ")}
                  </p>
                )}
                <p className={styles.when} title={absoluteTime(e.createdAt)}>
                  {relativeTime(e.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
