// drizzle-kit config — read by `pnpm --filter @fromtheloop/db generate`
// (and `studio`). This file is *not* used at runtime; the application reads
// schema directly via src/index.ts.
//
// Drizzle workflow:
//   1. Edit src/schema/*.ts
//   2. `pnpm --filter @fromtheloop/db generate` diffs schema against
//      src/migrations/meta/_journal.json and emits a new 0NNN_*.sql file.
//   3. Commit the SQL alongside the schema change.
//   4. `pnpm db:migrate` (src/migrate.ts) applies pending SQL.
//
// See ADR-0002 for why Drizzle over Prisma/Kysely.

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Env loading mirrors src/migrate.ts and src/seed/index.ts so every
// db-touching entrypoint reads the same source of truth. First match wins:
//   .env.local (gitignored, dev defaults)
//   .env       (gitignored, alt convention)
//   packages/db/.env (gitignored, package-scoped override)
config({ path: "../../.env.local" });
config({ path: "../../.env" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local at the repo root.",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  // strict: refuse to generate destructive ops (drops, renames) without an
  // explicit confirmation prompt. Keeps us honest in code review.
  strict: true,
  verbose: true,
});
