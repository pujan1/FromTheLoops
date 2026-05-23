// Query-plan assertion for the wedge-page lookup.
//
// What this suite catches:
//   - "Someone dropped reports_company_role_level_idx in a refactor
//     and the wedge page is now seqscan-on-every-load slow." → EXPLAIN
//     output won't mention the index name, test fails loud.
//   - "Someone reordered the composite index columns to (level, role,
//     company) and the (company, role, level) lookup can no longer use
//     it." → same failure.
//
// Trick: empty tables seqscan trivially because PG knows the cost is
// near-zero. Setting `enable_seqscan = off` forces the planner to
// consider indexes; if the right index exists, it gets chosen, and
// EXPLAIN shows its name. If not, the test fails.
//
// We use `SET LOCAL` so the planner setting only affects the current
// transaction — no leakage to subsequent tests.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestClient, type TestDb } from "./helpers.js";
describe("query plan", () => {
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

  it("wedge-page lookup uses reports_company_role_level_idx", async () => {
    // SET LOCAL: scoped to this transaction only.
    await db.execute(sql`SET LOCAL enable_seqscan = off`);
    // Mirror the canonical wedge query shape: filter by the three
    // composite-index columns, order by created_at DESC (recency feed),
    // limit (page size). The exact filter values don't matter for the
    // plan — uuid::uuid casts just satisfy the type system.
    const rows = await db.execute<{ "QUERY PLAN": string }>(sql`
      EXPLAIN (FORMAT TEXT)
      SELECT id, status, created_at
      FROM interview_reports
      WHERE company_id = '00000000-0000-0000-0000-000000000000'::uuid
        AND canonical_role_id = '00000000-0000-0000-0000-000000000000'::uuid
        AND level = 'L4'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(plan).toMatch(/reports_company_role_level_idx/);
  });
});
