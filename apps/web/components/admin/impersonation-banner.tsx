// Global "view as user" banner (Sprint 6 Day 9). Rendered in the root layout so
// an admin in a read-only impersonation session always has it pinned and can exit
// from any page. Renders nothing when no session is active (the common case).
// Server component: reads the admin-gated impersonation directly.

import { getDb } from "@fromtheloop/db";
import { exitViewAs } from "@/app/admin/view-as/actions";
import { getImpersonation } from "@/lib/view-as";
import styles from "./impersonation-banner.module.css";

export async function ImpersonationBanner() {
  const session = await getImpersonation(getDb());
  if (!session) return null;

  const label = session.displayName ?? (session.username ? `@${session.username}` : "user");

  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        <span className={styles.eye} aria-hidden>
          👁
        </span>
        Read-only — viewing as <strong>{label}</strong>. You can&apos;t act as this user.
      </span>
      <form action={exitViewAs}>
        <button type="submit" className={styles.exit}>
          Exit
        </button>
      </form>
    </div>
  );
}
