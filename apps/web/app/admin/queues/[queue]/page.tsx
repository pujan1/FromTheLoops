// A moderation queue (Sprint 6 Day 3). One dynamic route renders any queue: it
// resolves the config by slug, fetches that queue's pending rows, maps them to
// ModQueueItem[], and hands them to the generic <ModQueue> with the shared
// server action. Gated by requireModerator() (the admin layout also gates, this
// is defence-in-depth). The 3 taxonomy queues fetch real data; the not-yet-wired
// queues render their config with an empty list until their sprint day.

import { notFound } from "next/navigation";
import {
  getDb,
  listPendingCompanies,
  listPendingRoles,
  listPendingTopics,
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
