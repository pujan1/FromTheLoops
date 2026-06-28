// `pnpm backfill:aggregates` — rebuild the aggregate table over every live cell
// (thin wrapper over refreshAllAggregates). Idempotent.

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb, refreshAllAggregates } from "../index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

const started = Date.now();
const cells = await refreshAllAggregates(getDb());
console.log(
  `[backfill:aggregates] refreshed ${cells} cell(s) in ${Date.now() - started}ms`,
);
await closeDb();
