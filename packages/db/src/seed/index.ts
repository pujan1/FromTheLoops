// `pnpm db:seed` entrypoint. Applies the curated taxonomy fixtures (30
// companies + per-company levels + ~20 canonical roles) from ./curated.ts.
//
// Idempotent: seedCurated() upserts on natural keys, so this is safe to run
// repeatedly against the same database without duplicates or errors.

import { config } from "dotenv";
import { closeDb, getDb } from "../index.js";
import { seedCurated } from "./curated.js";

config({ path: "../../.env.local" });
config({ path: "../../.env" });
config({ path: ".env" });

async function main(): Promise<void> {
  const db = getDb();
  const result = await seedCurated(db);
  console.log(
    `seed ok — companies: ${result.companies}, ` +
      `levels: ${result.levels}, roles: ${result.roles}, ` +
      `topics: ${result.topics}`,
  );
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
