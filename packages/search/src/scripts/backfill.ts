// backfill:typesense (Sprint 3 Day 6) — rebuild every Typesense collection from
// Postgres. Provisions the collections first (create-if-missing), then indexes
// all VISIBLE reports + active companies + active topics. Idempotent: docs are
// upserted by id, so a re-run overwrites in place rather than duplicating.
//
//   pnpm backfill:typesense
//
// Reads DATABASE_URL + TYPESENSE_* from .env.local / .env (first match wins).

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "@fromtheloop/db";
import { backfillAll } from "../indexers/index.js";
import { getSearchClient } from "../client.js";
import { ensureCollections } from "../provision.js";

// packages/search/src/scripts → repo root is four directories up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

const started = Date.now();
const client = getSearchClient();

const provisioned = await ensureCollections(client);
for (const p of provisioned) {
  console.log(`[backfill:typesense] ${p.collection}: ${p.action}`);
}

const counts = await backfillAll(getDb(), client);
console.log(
  `[backfill:typesense] indexed reports=${counts.reports} companies=${counts.companies} topics=${counts.topics} in ${Date.now() - started}ms`,
);
await closeDb();
