// A moderation queue (Sprint 6 Day 3). One dynamic route renders any queue: it
// resolves the config by slug, fetches that queue's pending rows, maps them to
// ModQueueItem[], and hands them to the generic <ModQueue> with the shared
// server action. Gated by requireModerator() (the admin layout also gates, this
// is defence-in-depth). The 3 taxonomy queues fetch real data; the not-yet-wired
// queues render their config with an empty list until their sprint day.

import { notFound } from "next/navigation";
import {
  getDb,
  listContentFlags,
  listHeldReports,
  listPendingCompanies,
  listPendingRoles,
  listPendingTopics,
  listSoftDeleted,
} from "@fromtheloop/db";
import { requireModerator } from "@/lib/admin";
import { ModQueue } from "../../_components/mod-queue";
import { isQueueId, QUEUE_CONFIGS, type ModQueueItem, type QueueId } from "../queue-config";
import { runQueueAction } from "./actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const karmaField = (karma: number | null) => ({
  label: "Suggested by",
  value: karma == null ? "seed / unknown" : `${karma.toLocaleString()} karma`,
});

// A "possible duplicate" badge from the dedup hint, tinted by how close the
// match is — a strong near-match (the auto-approve block threshold) is a
// merge-or-reject warning; a weaker one is just informational.
const dedupBadge = (nearest: { name: string; score: number } | null) =>
  nearest
    ? [
        {
          label: `possible dup: ${nearest.name} (${Math.round(nearest.score * 100)}%)`,
          tone: nearest.score >= 0.55 ? ("warn" as const) : ("neutral" as const),
        },
      ]
    : undefined;

async function loadItems(queue: QueueId): Promise<ModQueueItem[]> {
  const db = getDb();
  switch (queue) {
    case "companies": {
      const rows = await listPendingCompanies(db);
      return rows.map((r) => ({
        id: r.id,
        primary: r.name,
        secondary: r.slug,
        fields: [{ label: "Domain", value: r.domain ?? "—" }, karmaField(r.suggestedByKarma)],
        badges: dedupBadge(r.nearest),
        createdAt: r.createdAt.toISOString(),
      }));
    }
    case "tags": {
      const rows = await listPendingTopics(db);
      return rows.map((r) => ({
        id: r.id,
        primary: r.name,
        secondary: r.slug,
        fields: [{ label: "Category", value: r.category ?? "uncategorized" }, karmaField(r.suggestedByKarma)],
        badges: dedupBadge(r.nearest),
        createdAt: r.createdAt.toISOString(),
      }));
    }
    case "roles": {
      const rows = await listPendingRoles(db);
      return rows.map((r) => ({
        id: r.id,
        primary: r.name,
        secondary: r.slug,
        fields: [{ label: "Folds into", value: r.canonicalName ?? "— (new role)" }],
        createdAt: r.createdAt.toISOString(),
      }));
    }
    case "soft-delete": {
      const rows = await listSoftDeleted(db);
      return rows.map((r) => ({
        id: r.id,
        primary: r.primary,
        secondary: r.secondary ?? undefined,
        fields: [
          { label: "Type", value: r.kind === "report" ? "Report" : "Comment" },
          { label: "Deleted by", value: r.author ?? "unknown" },
          {
            label: "Purge in",
            value: r.daysLeft === 0 ? "imminent" : `${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`,
          },
        ],
        badges: r.daysLeft <= 7 ? [{ label: "purging soon", tone: "warn" as const }] : undefined,
        createdAt: r.deletedAt.toISOString(),
      }));
    }
    case "new-user-hold": {
      const rows = await listHeldReports(db);
      return rows.map((r) => ({
        id: r.id,
        primary: `${r.company} · ${r.role}`,
        secondary: [r.level, r.month, r.outcome ?? undefined].filter(Boolean).join(" · "),
        fields: [karmaField(r.authorKarma), { label: "By", value: r.author ?? "unknown" }],
        href: `/reports/${r.id}`,
        createdAt: r.createdAt.toISOString(),
      }));
    }
    case "flags": {
      const rows = await listContentFlags(db);
      return rows.map((r) => {
        const reasons = r.reasons.map((x) => x.replace(/_/g, " ")).join(", ");
        const severe = r.reasons.some((x) => x === "pii" || x === "harassment");
        return {
          id: r.id,
          primary: r.primary,
          secondary: r.secondary ?? undefined,
          fields: [
            { label: "Type", value: r.kind === "report" ? "Report" : "Comment" },
            { label: "Author", value: r.author ?? "unknown" },
            { label: "Reasons", value: reasons },
          ],
          badges: [
            { label: `${r.flagCount} flag${r.flagCount === 1 ? "" : "s"}`, tone: "warn" as const },
            ...(severe ? [{ label: "sensitive", tone: "danger" as const }] : []),
          ],
          href: r.href,
          createdAt: r.lastFlaggedAt.toISOString(),
        };
      });
    }
    // Not yet wired (later sprint days): render the empty config.
    default:
      return [];
  }
}

export default async function QueuePage({
  params,
}: {
  params: Promise<{ queue: string }>;
}) {
  await requireModerator();
  const { queue } = await params;
  if (!isQueueId(queue)) notFound();

  const config = QUEUE_CONFIGS[queue];
  const items = await loadItems(queue);

  return (
    <main className={styles.page}>
      <ModQueue config={config} items={items} action={runQueueAction} />
    </main>
  );
}
