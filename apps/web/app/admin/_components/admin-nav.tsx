"use client";

// Admin shell tab nav (Sprint 6 Day 3). Highlights the active surface via the
// current pathname. The Health tab is admin-only; the layout passes whether the
// viewer clears that bar so moderators don't see a tab that 404s on them.

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./admin-nav.module.css";

type Tab = { href: string; label: string };

const QUEUE_TABS: Tab[] = [
  { href: "/admin/queues/companies", label: "Companies" },
  { href: "/admin/queues/tags", label: "Tags" },
  { href: "/admin/queues/roles", label: "Roles" },
  { href: "/admin/queues/new-user-hold", label: "Held" },
  { href: "/admin/queues/soft-delete", label: "Soft-delete" },
  { href: "/admin/audit", label: "Audit" },
];

export function AdminNav({ canSeeHealth }: { canSeeHealth: boolean }) {
  const pathname = usePathname();
  const tabs = canSeeHealth
    ? [...QUEUE_TABS, { href: "/admin/health", label: "Health" }]
    : QUEUE_TABS;

  return (
    <nav className={styles.nav} aria-label="Admin sections">
      <span className={styles.brand}>Moderation</span>
      <div className={styles.tabs}>
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
