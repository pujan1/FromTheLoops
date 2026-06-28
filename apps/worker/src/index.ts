import "./env.js"; // must load before anything reads process.env
import { Sentry } from "./sentry.js"; // must init before the rest
import { Queue, Worker } from "bullmq";
import { closeDb } from "@fromtheloop/db";
import { NOTIFICATIONS_QUEUE } from "@fromtheloop/shared";
import { redisConnection } from "./redis.js";
import { HELLO_QUEUE, processHello } from "./jobs/hello.js";
import {
  PURGE_PII_CRON,
  PURGE_PII_JOB,
  PURGE_PII_QUEUE,
  PURGE_PII_SCHEDULER,
  processPurgeDeletedPii,
} from "./jobs/purge-deleted-pii.js";
import { processSendEmail } from "./jobs/send-email.js";
import {
  eventJobId,
  processRefreshAggregate,
  REFRESH_AGGREGATE_QUEUE,
  REFRESH_EVENT_JOB,
  REFRESH_EVENT_JOB_OPTS,
  REFRESH_SWEEP_EVERY_MS,
  REFRESH_SWEEP_JOB,
  REFRESH_SWEEP_SCHEDULER,
} from "./jobs/refresh-aggregate.js";
import {
  indexEventJobId,
  INDEX_EVENT_JOB,
  INDEX_EVENT_JOB_OPTS,
  INDEX_SWEEP_EVERY_MS,
  INDEX_SWEEP_JOB,
  INDEX_SWEEP_SCHEDULER,
  INDEX_TYPESENSE_QUEUE,
  processIndexTypesense,
} from "./jobs/index-typesense.js";
import {
  karmaEventJobId,
  KARMA_EVENT_JOB,
  KARMA_EVENT_JOB_OPTS,
  KARMA_SWEEP_EVERY_MS,
  KARMA_SWEEP_JOB,
  KARMA_SWEEP_SCHEDULER,
  makeProcessRecomputeKarma,
  RECOMPUTE_KARMA_QUEUE,
} from "./jobs/recompute-karma.js";
import {
  processReconcile,
  RECONCILE_CRON,
  RECONCILE_JOB,
  RECONCILE_QUEUE,
  RECONCILE_SCHEDULER,
} from "./jobs/reconcile.js";
import { ensureCollections } from "@fromtheloop/search";
import { startEventListener } from "./listen.js";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);

const helloWorker = new Worker(HELLO_QUEUE, processHello, {
  connection: redisConnection,
  concurrency,
});

// The maintenance worker drains the cron-driven sweeps (currently just the
// 90-day PII purge). Concurrency 1 — these are infrequent, DB-heavy, and have
// no reason to overlap.
const purgeWorker = new Worker(PURGE_PII_QUEUE, processPurgeDeletedPii, {
  connection: redisConnection,
  concurrency: 1,
});

// Register the daily purge schedule. upsertJobScheduler is idempotent on the
// scheduler id, so re-running on every boot reconciles the cron rather than
// stacking duplicates. The Queue handle is only needed to own the scheduler;
// the Worker above is what actually executes the enqueued runs.
const purgeQueue = new Queue(PURGE_PII_QUEUE, { connection: redisConnection });
await purgeQueue.upsertJobScheduler(
  PURGE_PII_SCHEDULER,
  { pattern: PURGE_PII_CRON },
  { name: PURGE_PII_JOB },
);

// Transactional email dispatch (submission-confirmed, etc). Web renders +
// enqueues; this consumer sends via Resend.
const notificationsWorker = new Worker(NOTIFICATIONS_QUEUE, processSendEmail, {
  connection: redisConnection,
  concurrency,
});

// Aggregation refresh: drains the events outbox into per-(company,role,level)
// matview refreshes. Fed by the live LISTEN bridge (fast path) + a repeatable
// sweep (fallback for dropped notifications).
const refreshAggregateWorker = new Worker(
  REFRESH_AGGREGATE_QUEUE,
  processRefreshAggregate,
  { connection: redisConnection, concurrency },
);
const refreshAggregateQueue = new Queue(REFRESH_AGGREGATE_QUEUE, {
  connection: redisConnection,
});
await refreshAggregateQueue.upsertJobScheduler(
  REFRESH_SWEEP_SCHEDULER,
  { every: REFRESH_SWEEP_EVERY_MS },
  { name: REFRESH_SWEEP_JOB },
);

// Typesense search indexing: the second consumer of the events outbox. Same
// shape as refresh-aggregate (per-event fast path + repeatable fallback sweep),
// writing docs to Typesense. Collections are ensured on boot below.
const indexTypesenseWorker = new Worker(
  INDEX_TYPESENSE_QUEUE,
  processIndexTypesense,
  { connection: redisConnection, concurrency },
);
const indexTypesenseQueue = new Queue(INDEX_TYPESENSE_QUEUE, {
  connection: redisConnection,
});
await indexTypesenseQueue.upsertJobScheduler(
  INDEX_SWEEP_SCHEDULER,
  { every: INDEX_SWEEP_EVERY_MS },
  { name: INDEX_SWEEP_JOB },
);

// Karma recompute: the third consumer of the events outbox (Sprint 5 Day 7).
// Same fast-path + sweep shape, but two-stage and debounced per user — the
// processor enqueues per-user recompute jobs onto its OWN queue, so it's built
// via a factory closing over that queue handle.
const recomputeKarmaQueue = new Queue(RECOMPUTE_KARMA_QUEUE, {
  connection: redisConnection,
});
const recomputeKarmaWorker = new Worker(
  RECOMPUTE_KARMA_QUEUE,
  makeProcessRecomputeKarma(recomputeKarmaQueue),
  { connection: redisConnection, concurrency },
);
await recomputeKarmaQueue.upsertJobScheduler(
  KARMA_SWEEP_SCHEDULER,
  { every: KARMA_SWEEP_EVERY_MS },
  { name: KARMA_SWEEP_JOB },
);

// Reconciliation: the daily drift safety-net (Sprint 6 Day 9) — sweeps pending
// taxonomy auto-approve, rebuilds aggregate cells, and re-backfills Typesense.
// Cron-driven like the PII purge (concurrency 1 — infrequent, full-table, DB
// heavy, no reason to overlap). The primary paths (inline auto-approve + the
// outbox consumers above) keep these fresh; this only catches what they missed.
const reconcileWorker = new Worker(RECONCILE_QUEUE, processReconcile, {
  connection: redisConnection,
  concurrency: 1,
});
const reconcileQueue = new Queue(RECONCILE_QUEUE, { connection: redisConnection });
await reconcileQueue.upsertJobScheduler(
  RECONCILE_SCHEDULER,
  { pattern: RECONCILE_CRON },
  { name: RECONCILE_JOB },
);

// Self-provision Typesense collections on boot (idempotent — create-if-missing),
// the same way we upsert job schedulers above. So a fresh Hetzner deploy stands
// the collections up without a manual provision step. Best-effort: a Typesense
// blip at boot shouldn't crash the worker (the sweep + retries recover once it's
// back), so log and continue.
try {
  const provisioned = await ensureCollections();
  console.log(
    `[worker] typesense collections: ${provisioned
      .map((p) => `${p.collection}=${p.action}`)
      .join(" ")}`,
  );
} catch (err) {
  console.error("[worker] typesense provisioning failed (will retry via jobs):", err);
  Sentry.captureException(err, { tags: { phase: "boot-provision" } });
}

// One LISTEN connection fans every report-write NOTIFY out to BOTH consumers —
// the real-time fast path. It holds a Postgres connection open for the worker's
// whole lifetime, which on Neon's free tier blocks scale-to-zero and burns the
// monthly compute allowance. So it's opt-in: off by default (the fallback sweeps
// below still drain the outbox, just at sweep latency instead of sub-second),
// flip WORKER_EVENT_LISTENER=on once on a plan without a compute cap (Neon
// Launch). See docs/scaling.md rung 1.
const EVENT_LISTENER_ENABLED = process.env.WORKER_EVENT_LISTENER === "on";
const eventListener = EVENT_LISTENER_ENABLED
  ? await startEventListener([
      {
        queue: refreshAggregateQueue,
        jobName: REFRESH_EVENT_JOB,
        jobId: eventJobId,
        jobOpts: REFRESH_EVENT_JOB_OPTS,
        label: "refresh-aggregate",
      },
      {
        queue: indexTypesenseQueue,
        jobName: INDEX_EVENT_JOB,
        jobId: indexEventJobId,
        jobOpts: INDEX_EVENT_JOB_OPTS,
        label: "index-typesense",
      },
      {
        queue: recomputeKarmaQueue,
        jobName: KARMA_EVENT_JOB,
        jobId: karmaEventJobId,
        jobOpts: KARMA_EVENT_JOB_OPTS,
        label: "recompute-karma",
      },
    ])
  : null;
if (!EVENT_LISTENER_ENABLED) {
  console.log(
    "[worker] event listener OFF (WORKER_EVENT_LISTENER!=on) — outbox drains via fallback sweeps only, letting Neon scale to zero between them",
  );
}

const workers = [
  helloWorker,
  purgeWorker,
  notificationsWorker,
  refreshAggregateWorker,
  indexTypesenseWorker,
  recomputeKarmaWorker,
  reconcileWorker,
];

helloWorker.on("ready", () =>
  console.log(`[worker] ready — queue=${HELLO_QUEUE} concurrency=${concurrency}`),
);
purgeWorker.on("ready", () =>
  console.log(
    `[worker] ready — queue=${PURGE_PII_QUEUE} cron="${PURGE_PII_CRON}"`,
  ),
);
notificationsWorker.on("ready", () =>
  console.log(`[worker] ready — queue=${NOTIFICATIONS_QUEUE}`),
);
refreshAggregateWorker.on("ready", () =>
  console.log(
    `[worker] ready — queue=${REFRESH_AGGREGATE_QUEUE} sweep=${REFRESH_SWEEP_EVERY_MS}ms`,
  ),
);
indexTypesenseWorker.on("ready", () =>
  console.log(
    `[worker] ready — queue=${INDEX_TYPESENSE_QUEUE} sweep=${INDEX_SWEEP_EVERY_MS}ms`,
  ),
);
recomputeKarmaWorker.on("ready", () =>
  console.log(
    `[worker] ready — queue=${RECOMPUTE_KARMA_QUEUE} sweep=${KARMA_SWEEP_EVERY_MS}ms`,
  ),
);
reconcileWorker.on("ready", () =>
  console.log(`[worker] ready — queue=${RECONCILE_QUEUE} cron="${RECONCILE_CRON}"`),
);
for (const w of workers) {
  w.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
  w.on("failed", (job, err) => {
    console.error(`[worker] failed ${job?.id}:`, err);
    Sentry.captureException(err, {
      tags: { queue: job?.queueName },
      extra: { jobId: job?.id, jobName: job?.name },
    });
  });
}

const shutdown = async (signal: string) => {
  console.log(`[worker] ${signal} — shutting down`);
  // Stop accepting NOTIFY-driven enqueues before tearing down the queue.
  if (eventListener) await eventListener.close();
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all([
    purgeQueue.close(),
    refreshAggregateQueue.close(),
    indexTypesenseQueue.close(),
    recomputeKarmaQueue.close(),
    reconcileQueue.close(),
  ]);
  // Release the shared Postgres pool the jobs opened via getDb().
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
