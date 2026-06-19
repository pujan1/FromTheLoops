// Audit history view (Sprint 6 Day 4). The read side of the moderation audit
// log: every command already writes mod_action_logs in-transaction (Day 3), this
// surfaces it. Two modes from one query:
//   • global  — /admin/audit            → recent activity across all queues
//   • entity  — /admin/audit?type=company&id=<uuid> → one entity's full history
// Gated by requireModerator() (the admin layout also gates; defence-in-depth).

import Link from "next/link";
import { getDb, listModActions, type ModActionType } from "@fromtheloop/db";
import { requireModerator } from "@/lib/admin";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

// Visual tone per action, reusing the queue's badge vocabulary.
const ACTION_TONE: Record<ModActionType, "good" | "warn" | "danger" | "neutral"> = {
  approve: "good",
  merge: "good",
  reject: "warn",
  hide: "warn",
  delete: "danger",
  ban: "danger",
  edit_taxonomy: "neutral",
};

const ACTION_LABEL: Record<ModActionType, string> = {
  approve: "approved",
  merge: "merged",
  reject: "rejected",
  hide: "hid",
  delete: "deleted",
  ban: "banned",
  edit_taxonomy: "edited",
};

function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const absolute = (date: Date) =>
  date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  await requireModerator();
  const { type, id } = await searchParams;
  const scoped = Boolean(type && id);

  const db = getDb();
  const entries = await listModActions(db, { targetType: type, targetId: id });

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{scoped ? "Entity history" : "Audit log"}</h1>
          <p className={styles.desc}>
            {scoped
              ? `Every recorded moderation action on this ${type}.`
              : "Recent moderation actions across all queues — newest first. Every approve, reject, and merge is logged here."}
          </p>
          {scoped && (
            <Link href="/admin/audit" className={styles.back}>
              ← All activity
            </Link>
          )}
        </div>
        <span className={styles.count}>{entries.length} entries</span>
      </header>

      {entries.length === 0 ? (
        <p className={styles.empty}>
          {scoped ? "No recorded actions on this entity yet." : "No moderation actions logged yet."}
        </p>
      ) : (
        <ol className={styles.feed}>
          {entries.map((e) => {
            const tone = ACTION_TONE[e.actionType] ?? "neutral";
            const mergedInto =
              e.actionType === "merge" && e.metadata && typeof e.metadata.mergedInto === "string"
                ? (e.metadata.mergedInto as string)
                : null;
            return (
              <li key={e.id} className={styles.row}>
                <span className={`${styles.dot} ${styles[`dot--${tone}`]}`} aria-hidden />
                <div className={styles.body}>
                  <p className={styles.line}>
                    <span className={styles.mod}>{e.modName ?? "unknown mod"}</span>{" "}
                    <span className={`${styles.verb} ${styles[`verb--${tone}`]}`}>
                      {ACTION_LABEL[e.actionType] ?? e.actionType}
                    </span>{" "}
                    a <span className={styles.target}>{e.targetType}</span>{" "}
                    {!scoped && (
                      <Link
                        href={`/admin/audit?type=${e.targetType}&id=${e.targetId}`}
                        className={styles.idLink}
                        title="See this entity's full history"
                      >
                        {e.targetId.slice(0, 8)}
                      </Link>
                    )}
                  </p>
                  {e.reason && <p className={styles.reason}>“{e.reason}”</p>}
                  {mergedInto && (
                    <p className={styles.meta}>
                      → merged into{" "}
                      <Link href={`/admin/audit?type=role&id=${mergedInto}`} className={styles.idLink}>
                        {mergedInto.slice(0, 8)}
                      </Link>
                    </p>
                  )}
                  <p className={styles.when} title={absolute(e.createdAt)}>
                    {relativeTime(e.createdAt)}
                    {e.modKarma != null && <span className={styles.karma}> · {e.modKarma.toLocaleString()} karma</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
