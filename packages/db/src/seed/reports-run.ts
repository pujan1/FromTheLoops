// `pnpm db:seed:reports` — taxonomy + dummy reports + aggregates + comments.
// Idempotent. Run `pnpm backfill:typesense` afterward to populate search (the db
// package must not depend on the search package).

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb, refreshAllAggregates } from "../index.js";
import { seedComments } from "./comments.js";
import { seedCurated } from "./curated.js";
import { seedReports } from "./reports.js";

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

  const c = await seedComments(db);
  console.log(
    `[seed:reports] comments ok — ${c.comments} comments + ${c.likes} likes ` +
      `across ${c.reports} report(s). Rich thread: /reports/${c.mainReportId}`,
  );

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
