import { Worker } from "bullmq";
import { redisConnection } from "./redis.js";
import { HELLO_QUEUE, processHello } from "./jobs/hello.js";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);

const helloWorker = new Worker(HELLO_QUEUE, processHello, {
  connection: redisConnection,
  concurrency,
});

helloWorker.on("ready", () =>
  console.log(`[worker] ready — queue=${HELLO_QUEUE} concurrency=${concurrency}`),
);
helloWorker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
helloWorker.on("failed", (job, err) =>
  console.error(`[worker] failed ${job?.id}:`, err),
);

const shutdown = async (signal: string) => {
  console.log(`[worker] ${signal} — shutting down`);
  await helloWorker.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
