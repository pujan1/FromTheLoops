// Editable slur/PII/spam blocklist (Sprint 6 Day 9). The admin-only surface for
// the patterns that gate heuristic auto-approve: a name matching any enabled
// entry never self-promotes, it lands in the human taxonomy queue instead. Gated
// by requireAdmin() — stricter than the moderator floor the admin layout sets,
// because editing what bypasses review is a higher-trust action.

import { getDb, listBlocklist } from "@fromtheloop/db";
import { requireAdmin } from "@/lib/admin";
import { BlocklistEditor } from "./blocklist-editor";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function BlocklistPage() {
  await requireAdmin();

  const entries = await listBlocklist(getDb());

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Name blocklist</h1>
          <p className={styles.desc}>
            Case-insensitive regexes tested against proposed company and tag names. A name matching
            any <strong>enabled</strong> entry can&apos;t auto-approve — it&apos;s held for a human in
            the taxonomy queues. Edits take effect within a minute, no redeploy. Keep patterns
            simple; they run untimed.
          </p>
        </div>
        <span className={styles.count}>
          {entries.filter((e) => e.enabled).length}/{entries.length} active
        </span>
      </header>

      <BlocklistEditor entries={entries} />
    </main>
  );
}
