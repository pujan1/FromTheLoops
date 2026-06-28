// `pnpm backfill:typesense` — provision collections, then rebuild every
// collection from Postgres. Idempotent (docs upserted by id).

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "@fromtheloop/db";
import { backfillAll } from "../indexers/index.js";
import { getSearchClient } from "../client.js";
import { ensureCollections } from "../provision.js";

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
