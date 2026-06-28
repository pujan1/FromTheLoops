// `pnpm --filter @fromtheloop/search provision` — create the committed
// collections. Idempotent.

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCollections } from "../provision.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

const results = await ensureCollections();
for (const r of results) {
  console.log(`[provision] ${r.collection}: ${r.action}`);
}
console.log(`[provision] done — ${results.length} collection(s)`);
