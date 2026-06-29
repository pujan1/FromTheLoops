// reconcile — daily drift safety-net. Everything here has a primary lower-latency
// path (inline taxonomy auto-approve, the events-outbox consumers); this is the
// backstop for when those miss. Re-runs three idempotent passes wholesale —
// auto-approve, refresh aggregates, Typesense backfill — each in its own
// try/catch so one outage can't block the others; failures are collected and
// re-thrown so BullMQ retries the (idempotent) whole job. Daily, not the 30-min
// sweep cadence, to keep Neon idle. See docs/scaling.md.

import { getDb, refreshAllAggregates, runAutoApprove } from "@fromtheloop/db";
import { backfillAll, ensureCollections, getSearchClient } from "@fromtheloop/search";
import type { Job } from "bullmq";

export const RECONCILE_QUEUE = "reconcile";

// JobScheduler id + job name for the repeatable entry. Stable strings so
// re-registering on every boot updates the same scheduler instead of stacking.
export const RECONCILE_SCHEDULER = "reconcile-daily";
export const RECONCILE_JOB = "reconcile";

// Daily at 04:23 UTC — off-peak, a deliberately non-round minute, and clear of
// the 03:17 PII purge so the two maintenance sweeps don't overlap.
export const RECONCILE_CRON = "23 4 * * *";

export async function processReconcile(job: Job): Promise<void> {
  const db = getDb();
  const failures: { pass: string; err: unknown }[] = [];

  try {
    const summary = await runAutoApprove(db);
    console.log(
      `[reconcile] job ${job.id} auto-approve: evaluated ${summary.evaluated}, approved ${summary.approved}`,
    );
  } catch (err) {
    console.error(`[reconcile] job ${job.id} auto-approve FAILED:`, err);
    failures.push({ pass: "auto-approve", err });
  }

  try {
    const cells = await refreshAllAggregates(db);
    console.log(`[reconcile] job ${job.id} aggregates: refreshed ${cells} cell(s)`);
  } catch (err) {
    console.error(`[reconcile] job ${job.id} aggregates FAILED:`, err);
    failures.push({ pass: "aggregates", err });
  }

  try {
    const client = getSearchClient();
    // Idempotent create-if-missing; guards against a Typesense reset between boots.
    await ensureCollections(client);
    const counts = await backfillAll(db, client);
    console.log(
      `[reconcile] job ${job.id} typesense: reports=${counts.reports} companies=${counts.companies} topics=${counts.topics}`,
    );
  } catch (err) {
    console.error(`[reconcile] job ${job.id} typesense FAILED:`, err);
    failures.push({ pass: "typesense", err });
  }

  if (failures.length > 0) {
    // Surface a single error so BullMQ retries the whole job; every pass is
    // idempotent, so re-running the ones that already succeeded is harmless.
    throw new AggregateError(
      failures.map((f) => f.err),
      `reconcile: ${failures.map((f) => f.pass).join(", ")} failed`,
    );
  }
}
