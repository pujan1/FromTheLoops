import { Queue } from "bullmq";
import { redisConnection } from "../redis.js";
import { HELLO_QUEUE, type HelloJobData } from "../jobs/hello.js";

const queue = new Queue(HELLO_QUEUE, { connection: redisConnection });

const message = process.argv[2] ?? `hello at ${new Date().toISOString()}`;
const job = await queue.add("hello", { message } satisfies HelloJobData);

console.log(`enqueued ${job.id}: "${message}"`);

await queue.close();
