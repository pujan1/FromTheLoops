// `pnpm db:migrate` entrypoint. Applies any unapplied SQL files from
// src/migrations/ into the database pointed at by DATABASE_URL.
//
// Why this exists (instead of just `drizzle-kit migrate`):
//   1. We need to `CREATE EXTENSION IF NOT EXISTS pgcrypto` *before* the
//      first migration runs, because `gen_random_uuid()` is used in column
//      defaults. drizzle-kit migrate has no pre-hook for this.
//   2. postgres.js logs every PG NOTICE (including the harmless
//      "extension already exists, skipping" lines on repeat runs).
//      Silenced via `onnotice: () => {}` so the script output stays clean.
//
// Idempotent. Drizzle records applied migration hashes in the
// `drizzle.__drizzle_migrations` table, so re-running this is a no-op once
// everything is current.

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: "../../.env.local" });
config({ path: "../../.env" });
config({ path: ".env" });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Suppress PG NOTICE-level chatter on both connections. Errors still
  // surface via the rejection — this only silences informational logs.
  const onnotice = () => {};

  // Bootstrap connection: extension setup only. Separate pool so the
  // migrator's transactional connection starts in a known-clean state.
  const bootstrap = postgres(url, { max: 1, prepare: false, onnotice });
  await bootstrap`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await bootstrap.end({ timeout: 5 });

  // Migrator connection: drizzle's migrate() runs each statement in
  // src/migrations/*.sql, ordered by filename, transactionally per file.
  const client = postgres(url, { max: 1, prepare: false, onnotice });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./src/migrations" });
  await client.end({ timeout: 5 });
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
