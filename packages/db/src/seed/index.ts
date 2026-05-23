// `pnpm db:seed` entrypoint. Sprint-0 deliverable is "at least one trivial
// row" — that's all this does. The real seed_dummy + seed_curated fixtures
// (PLAN.md §Data model) land in Sprint 1 when the taxonomy work begins.
//
// Idempotent via onConflictDoNothing: safe to run repeatedly against the
// same database without producing duplicates or errors.

import { config } from "dotenv";
import { closeDb, getDb } from "../index.js";
import { companies } from "../schema/index.js";

config({ path: "../../.env.local" });
config({ path: "../../.env" });
config({ path: ".env" });

async function main(): Promise<void> {
  const db = getDb();
  await db
    .insert(companies)
    .values({ slug: "fromtheloop", name: "FromTheLoop (placeholder)" })
    .onConflictDoNothing({ target: companies.slug });
  const rows = await db.select().from(companies);
  console.log(`seed ok — companies rows: ${rows.length}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
