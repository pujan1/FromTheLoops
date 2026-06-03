// Load env (.env.local / .env) before anything reads process.env.
import "./env.js";
// Sentry must initialize before the rest so its global error/rejection
// handlers are in place for the whole process lifetime.
import { Sentry } from "./sentry.js";
import { Queue, Worker } from "bullmq";
import { closeDb } from "@fromtheloop/db";
import { redisConnection } from "./redis.js";
import { HELLO_QUEUE, processHello } from "./jobs/hello.js";
import {
  PURGE_PII_CRON,
  PURGE_PII_JOB,
  PURGE_PII_QUEUE,
  PURGE_PII_SCHEDULER,
  processPurgeDeletedPii,
} from "./jobs/purge-deleted-pii.js";

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

const workers = [helloWorker, purgeWorker];

helloWorker.on("ready", () =>
  console.log(`[worker] ready — queue=${HELLO_QUEUE} concurrency=${concurrency}`),
);
purgeWorker.on("ready", () =>
  console.log(
    `[worker] ready — queue=${PURGE_PII_QUEUE} cron="${PURGE_PII_CRON}"`,
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
  await Promise.all(workers.map((w) => w.close()));
  await purgeQueue.close();
  // Release the shared Postgres pool the purge job opened via getDb().
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
