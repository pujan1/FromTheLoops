// One-shot Typesense provisioner. Run after `pnpm docker:up` in dev, or against
// the Hetzner box's Typesense, to create the committed collections:
//
//   pnpm --filter @fromtheloop/search provision
//
// Idempotent — re-running only fills in whatever's missing. Reads connection
// config from TYPESENSE_* env (see env.ts; defaults to local docker Typesense).

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCollections } from "../provision.js";

// packages/search/src/scripts → repo root is four directories up. First match
// wins (.env.local then .env), mirroring the worker/db loaders.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

const results = await ensureCollections();
for (const r of results) {
  console.log(`[provision] ${r.collection}: ${r.action}`);
}
console.log(`[provision] done — ${results.length} collection(s)`);
