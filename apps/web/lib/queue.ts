import { NOTIFICATIONS_QUEUE } from "@fromtheloop/shared";
import { Queue, type ConnectionOptions } from "bullmq";

function buildConnection(): ConnectionOptions {
  const REDIS_URL = process.env.REDIS_URL;
  if (!REDIS_URL) throw new Error("REDIS_URL is required");

  const parsed = new URL(REDIS_URL);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

let helloQueue: Queue | null = null;
export function getHelloQueue(): Queue {
  helloQueue ??= new Queue("hello", { connection: buildConnection() });
  return helloQueue;
}

let notificationsQueue: Queue | null = null;
export function getNotificationsQueue(): Queue {
  notificationsQueue ??= new Queue(NOTIFICATIONS_QUEUE, {
    connection: buildConnection(),
  });
  return notificationsQueue;
}
