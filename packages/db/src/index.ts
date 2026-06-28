// Shared Postgres client. Every package goes through getDb() so query types
// stay aligned with the migrated schema.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: { client: ReturnType<typeof postgres>; db: Database } | null = null;

export function getDb(): Database {
  if (cached) return cached.db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // prepare: false — required by Neon's transaction-mode pooler. idle_timeout
  // closes idle connections so Neon's free-tier compute can scale to zero (a
  // lingering handle pins it awake 24/7).
  const idleTimeout = Number(process.env.DB_IDLE_TIMEOUT_S) || 20;
  const client = postgres(url, { max: 10, prepare: false, idle_timeout: idleTimeout });
  const db = drizzle(client, { schema });
  cached = { client, db };
  return db;
}

// Used by tests + the worker's SIGTERM handler (in-flight queries get up to 5s).
export async function closeDb(): Promise<void> {
  if (!cached) return;
  await cached.client.end({ timeout: 5 });
  cached = null;
}

export { sql } from "drizzle-orm";

export { schema };
export * from "./schema/index.js";

export * from "./taxonomy/index.js";
export * from "./users/index.js";
export * from "./reports/index.js";
export * from "./pipeline/index.js";
export * from "./engagement/index.js";
export * from "./moderation/index.js";
