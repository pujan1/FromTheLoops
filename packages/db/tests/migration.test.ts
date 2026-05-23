// Migration shape assertions.
//
// What this suite catches:
//   - "We added a table in schema/*.ts but forgot to regenerate the
//     migration." → information_schema query misses the table.
//   - "We dropped or renamed the wedge-page composite index in a
//     refactor and didn't notice." → pg_indexes query misses it.
//   - "drizzle migrator silently no-op'd because the journal got
//     corrupted." → __drizzle_migrations row count is 0.
//
// This file reads catalog tables only; no inserts. Cheap, runs in ~50ms
// after the container is up.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("migrations", () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(() => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
  });

  afterAll(async () => {
    await close();
  });

  it("creates every expected table in the public schema", async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const names = new Set(rows.map((r) => r.table_name));
    for (const expected of [
      "users",
      "companies",
      "roles",
      "topics",
      "interview_reports",
      "rounds",
      "questions",
      "question_topics",
      "user_verifications",
      "mod_action_logs",
    ]) {
      expect(names, `table ${expected} missing`).toContain(expected);
    }
  });

  it("records the migration in the drizzle journal", async () => {
    const rows = await db.execute<{ hash: string }>(sql`
      SELECT hash FROM drizzle.__drizzle_migrations
    `);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("creates the wedge-page composite index", async () => {
    const rows = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'interview_reports'
    `);
    const names = rows.map((r) => r.indexname);
    expect(names).toContain("reports_company_role_level_idx");
  });
});
