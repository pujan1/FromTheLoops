// `pnpm db:seed:reports` entrypoint. Lays down the Sprint 4 wedge-page fixtures:
//
//   1. seedCurated()       — ensure taxonomy exists (idempotent; safe if already run)
//   2. seedReports()       — ~150 active `seed_dummy` reports across mixed-density cells
//   3. refreshAllAggregates() — rebuild the per-cell aggregate table so the wedge
//                               page renders Position-Y immediately
//
// Typesense is NOT touched here (the db package must not depend on the search
// package). Run `pnpm backfill:typesense` afterward — with the local stack up —
// to populate search. The runner reminds you on exit.
//
// Idempotent end-to-end: seedReports() clears prior seed_dummy reports first,
// and refreshAllAggregates() recomputes wholesale.

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb, refreshAllAggregates } from "../index.js";
import { seedCurated } from "./curated.js";
import { seedReports } from "./reports.js";

// packages/db/src/seed → repo root is four directories up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });

async function main(): Promise<void> {
  const db = getDb();
  const started = Date.now();

  const tax = await seedCurated(db);
  console.log(
    `[seed:reports] taxonomy ok — companies: ${tax.companies}, roles: ${tax.roles}, ` +
      `levels: ${tax.levels}, topics: ${tax.topics}`,
  );

  const r = await seedReports(db);
  console.log(
    `[seed:reports] reports ok — ${r.reports} reports across ${r.cells} cells ` +
      `(${r.rounds} rounds, ${r.questions} questions, ${r.authors} authors)`,
  );

  const cells = await refreshAllAggregates(db);
  console.log(`[seed:reports] aggregates refreshed — ${cells} cell(s)`);

  console.log(
    `[seed:reports] done in ${Date.now() - started}ms. ` +
      `Next: run \`pnpm backfill:typesense\` (with the stack up) to populate search.`,
  );
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
