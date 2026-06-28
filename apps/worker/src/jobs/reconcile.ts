// reconcile — the daily drift safety-net (Sprint 6 Day 9).
//
// Everything here has a primary, lower-latency path already:
//   - taxonomy auto-approve runs inline when a verified user suggests a clean,
//     unique company/topic (submit action) — see moderation/auto-approve.ts;
//   - the aggregate matview + Typesense docs are kept live by the events-outbox
//     consumers (refresh-aggregate / index-typesense), fed by NOTIFY + sweeps.
//
// This job is the BACKSTOP for when those miss: a pending row whose inline hook
// threw, a matview cell that drifted, a search doc a dropped event never wrote.
// It re-runs the full, idempotent reconciles wholesale, once a day:
//   1. runAutoApprove      — sweep ALL pending taxonomy, promote the low-risk.
//   2. refreshAllAggregates — rebuild every live aggregate cell.
//   3. backfillAll         — re-import every report/company/topic into Typesense.
//
// Cron-driven (no per-row trigger), carries no data, safe to run as often as the
// schedule fires. The three passes are independent: a Typesense outage must not
// block the taxonomy/aggregate reconcile, so each runs in its own try/catch and
// any failure is collected and re-thrown at the end — BullMQ then retries the
// whole job, which is safe because every pass is idempotent. Daily (not the
// 30-min outbox sweep cadence) keeps Neon idle: this is a safety net, not the
// delivery path. See docs/scaling.md + the Neon scale-to-zero tuning in index.ts.

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
