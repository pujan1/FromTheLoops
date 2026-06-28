// `pnpm --filter @fromtheloop/db autoapprove` — sweep pending taxonomy and
// promote the low-risk rows. Idempotent. The submit path also runs this inline.

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb, runAutoApprove } from "../index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

const started = Date.now();
const summary = await runAutoApprove(getDb());
console.log(
  `[autoapprove] evaluated ${summary.evaluated}, approved ${summary.approved} in ${Date.now() - started}ms`,
);
for (const o of summary.outcomes) {
  const verdict = o.approved ? "approved" : `held (${o.blockedBy.join(", ")})`;
  console.log(`  · ${o.kind} "${o.name}" → ${verdict}`);
}
await closeDb();
