// Load env (.env.local / .env) before anything reads process.env.
import "./env.js";
// Sentry must initialize before the rest so its global error/rejection
// handlers are in place for the whole process lifetime.
import { Sentry } from "./sentry.js";
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
  processRefreshAggregate,
  REFRESH_AGGREGATE_QUEUE,
  REFRESH_SWEEP_EVERY_MS,
  REFRESH_SWEEP_JOB,
  REFRESH_SWEEP_SCHEDULER,
} from "./jobs/refresh-aggregate.js";
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
const eventListener = await startEventListener(refreshAggregateQueue);

const workers = [
  helloWorker,
  purgeWorker,
  notificationsWorker,
  refreshAggregateWorker,
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
  await eventListener.close();
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all([purgeQueue.close(), refreshAggregateQueue.close()]);
  // Release the shared Postgres pool the jobs opened via getDb().
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
