// Per-worker setupFile for the "actions" project. Runs in every action test
// file's worker before its tests.
//
// Three jobs:
//   1. Point getDb() at the container by setting DATABASE_URL from the URL
//      global-setup broadcast. getDb() caches its client off this env var, so it
//      has to be set before the first action call — beforeAll covers that.
//   2. Clear ADMIN_CLERK_IDS so the break-glass allowlist never silently
//      promotes a test's mock Clerk id to super_admin (role gating must come
//      from the mocked session claims, the thing under test).
//   3. Truncate every table between cases so files/tests don't bleed state. We
//      enumerate public tables at runtime rather than hard-coding a list, so a
//      new table can't quietly escape the reset (drizzle's migration ledger
//      lives in its own schema and is untouched).

import { afterAll, afterEach, beforeAll, inject } from "vitest";
import postgres from "postgres";
import { closeDb } from "@fromtheloop/db";

let client: ReturnType<typeof postgres> | undefined;
let truncateSql: string | undefined;

beforeAll(async () => {
  const url = inject("databaseUrl");
  process.env.DATABASE_URL = url;
  delete process.env.ADMIN_CLERK_IDS;

  client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const rows = await client<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  truncateSql = `TRUNCATE ${names} RESTART IDENTITY CASCADE`;
});

afterEach(async () => {
  if (client && truncateSql) await client.unsafe(truncateSql);
});

afterAll(async () => {
  await closeDb();
  await client?.end({ timeout: 5 });
});
