import type { ConnectionOptions } from "bullmq";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const parsed = new URL(REDIS_URL);

export const redisConnection: ConnectionOptions = {
  host: parsed.hostname,
  port: Number(parsed.port) || 6379,
  password: parsed.password || undefined,
  username: parsed.username || undefined,
  tls: parsed.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};
