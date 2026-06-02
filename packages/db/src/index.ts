// Shared database client. Every package that talks to Postgres goes through
// `getDb()` from here — apps/web (route handlers, server components) and
// apps/worker (BullMQ consumers) both import the same instance so the query
// types stay aligned with the migrated schema.
//
// Driver choice: `postgres` (postgres.js) was picked over `pg` because it
//   (a) works against both local Postgres and Neon's pooled URL with no
//       per-environment branching,
//   (b) is small and edge-friendlier than `pg`,
//   (c) is the canonical pairing Drizzle docs use for postgres-js.
// When we later add edge runtime (Vercel Edge), we can swap to
// `drizzle-orm/neon-serverless` without changing any query code — schema
// types are driver-agnostic.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

// Module-level singleton. Long-lived processes (worker) reuse one pool; the
// Next.js dev server reuses across HMR reloads in the same Node process.
// Serverless cold starts get a fresh instance per container, which is fine
// because Neon's pooled endpoint handles the connection multiplexing.
let cached: { client: ReturnType<typeof postgres>; db: Database } | null = null;

export function getDb(): Database {
  if (cached) return cached.db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // max: 10 — sized for solo-dev throughput. Bump when we see queue depth
  //   issues on the worker (BullMQ runs concurrent jobs; each can fan out
  //   N queries).
  // prepare: false — postgres.js prepared statements are incompatible with
  //   Neon's connection pooler (transaction-mode PgBouncer doesn't preserve
  //   prepared-statement state across pooled connections). Disabling here
  //   means the same client works locally and on Neon without surprises.
  const client = postgres(url, { max: 10, prepare: false });
  const db = drizzle(client, { schema });
  cached = { client, db };
  return db;
}

// Used by tests and graceful shutdown. The worker's SIGTERM handler will
// call this before exit so in-flight queries get up to 5s to finish.
export async function closeDb(): Promise<void> {
  if (!cached) return;
  await cached.client.end({ timeout: 5 });
  cached = null;
}

// Re-export drizzle-orm helpers that callers need for query composition.
// Hides the ORM choice behind one import path so apps don't take a direct
// dep on `drizzle-orm`.
export { sql } from "drizzle-orm";

// Re-export the schema namespace under two shapes:
//   `import { schema } from "@fromtheloop/db"` — for code that wants the
//      whole bag (e.g., constructing dynamic queries).
//   `import { interviewReports } from "@fromtheloop/db"` — for everyday
//      table-level imports.
export { schema };
export * from "./schema/index.js";

// Taxonomy lookup + suggest-pending helpers (Sprint 1 Day 3). Apps import
// these for autocomplete; they ride the pg_trgm indexes from migration 0002.
export * from "./taxonomy.js";

// User upsert-on-visit + submission-draft data-access (Sprint 1 Day 6).
export * from "./users.js";
export * from "./drafts.js";
