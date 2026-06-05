// backfill:aggregates (Sprint 3 Day 6) — rebuild the per-(company,role,level)
// aggregate table from scratch over every distinct live cell. Thin wrapper over
// refreshAllAggregates (the SQL does the work; this drops orphan cells + loops
// every live cell). Idempotent — safe to re-run.
//
//   pnpm backfill:aggregates
//
// Reads DATABASE_URL from .env.local / .env (first match wins), mirroring the
// migrate/seed scripts.

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb, refreshAllAggregates } from "../index.js";

// packages/db/src/scripts → repo root is four directories up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

const started = Date.now();
const cells = await refreshAllAggregates(getDb());
console.log(
  `[backfill:aggregates] refreshed ${cells} cell(s) in ${Date.now() - started}ms`,
);
await closeDb();
