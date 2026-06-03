// 90-day PII purge — the worker side of soft delete.
//
// Soft-deleting a report (web: softDeleteReportAction) only flips status to
// 'deleted' and stamps deleted_at; the user's free text lives on so an
// appeal/audit window exists. This job is what finally scrubs it: once a
// report has been deleted for PII_RETENTION_MS (90 days), its round
// experience prose and question prose are cleared (see purgeDeletedReportPii).
//
// It runs on a daily cron registered as a BullMQ JobScheduler (see index.ts),
// not on demand — there's no per-report trigger, just a steady sweep. The DB
// query is the source of truth for "what's due"; the job carries no data and
// is safe to run as often as the schedule fires (idempotent: already-purged
// rows are skipped via pii_purged_at).

import { getDb, PII_RETENTION_MS, purgeDeletedReportPii } from "@fromtheloop/db";
import type { Job } from "bullmq";

export const PURGE_PII_QUEUE = "purge-deleted-pii";

// JobScheduler id + job name for the repeatable entry. Stable strings so
// re-registering on every boot updates the same scheduler instead of stacking.
export const PURGE_PII_SCHEDULER = "purge-deleted-pii-daily";
export const PURGE_PII_JOB = "purge";

// Daily at 03:17 UTC — an off-peak, deliberately non-round minute so this sweep
// doesn't pile onto other on-the-hour cron work.
export const PURGE_PII_CRON = "17 3 * * *";

export async function processPurgeDeletedPii(job: Job): Promise<void> {
  const cutoff = new Date(Date.now() - PII_RETENTION_MS);
  const { reportsPurged } = await purgeDeletedReportPii(getDb(), cutoff);
  console.log(
    `[purge-deleted-pii] job ${job.id}: purged ${reportsPurged} report(s) deleted before ${cutoff.toISOString()}`,
  );
}
