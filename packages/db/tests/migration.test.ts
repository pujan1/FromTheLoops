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
      "company_levels",
      "submission_drafts",
      "aggregates_company_role_level",
      "events",
    ]) {
      expect(names, `table ${expected} missing`).toContain(expected);
    }
  });

  it("creates the events NOTIFY trigger (migration 0010)", async () => {
    const fns = await db.execute<{ proname: string }>(sql`
      SELECT proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND proname = 'notify_event'
    `);
    expect(fns.map((r) => r.proname)).toContain("notify_event");

    const trigs = await db.execute<{ tgname: string }>(sql`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'public.events'::regclass AND NOT tgisinternal
    `);
    expect(trigs.map((r) => r.tgname)).toContain("events_notify");
  });

  it("creates the aggregation refresh functions (migration 0008)", async () => {
    const rows = await db.execute<{ proname: string }>(sql`
      SELECT proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    `);
    const names = new Set(rows.map((r) => r.proname));
    for (const expected of [
      "report_trust_weight",
      "refresh_aggregate_cell",
      "refresh_all_aggregates",
    ]) {
      expect(names, `function ${expected} missing`).toContain(expected);
    }
  });

  it("records every migration in the drizzle journal", async () => {
    // 0000 (initial) + 0001 (taxonomy/drafts) + 0002 (trgm indexes) + 0003
    // (topics taxonomy columns) + 0004 (topics trgm indexes); guards a
    // corrupted journal silently skipping a file.
    const rows = await db.execute<{ hash: string }>(sql`
      SELECT hash FROM drizzle.__drizzle_migrations
    `);
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it("enables pg_trgm and the taxonomy trigram indexes (migrations 0002, 0004)", async () => {
    const ext = await db.execute<{ extname: string }>(sql`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `);
    expect(ext.map((r) => r.extname)).toContain("pg_trgm");

    const rows = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `);
    const names = new Set(rows.map((r) => r.indexname));
    for (const expected of [
      "companies_name_trgm_idx",
      "companies_aliases_trgm_idx",
      "roles_name_trgm_idx",
      "roles_aliases_trgm_idx",
      "topics_name_trgm_idx",
      "topics_aliases_trgm_idx",
    ]) {
      expect(names, `index ${expected} missing`).toContain(expected);
    }
  });

  it("creates the wedge-page composite index", async () => {
    const rows = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'interview_reports'
    `);
    const names = rows.map((r) => r.indexname);
    expect(names).toContain("reports_company_role_level_idx");
  });

  it("creates the taxonomy/draft indexes", async () => {
    const rows = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `);
    const names = new Set(rows.map((r) => r.indexname));
    for (const expected of [
      "company_levels_company_slug_uq",
      "company_levels_company_idx",
      "drafts_user_idx",
      "companies_status_idx",
      "roles_status_idx",
      "topics_status_idx",
    ]) {
      expect(names, `index ${expected} missing`).toContain(expected);
    }
  });

  it("creates the topic category enum and nullable topics.category column", async () => {
    const enumRows = await db.execute<{ enumlabel: string }>(sql`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'topic_category'
      ORDER BY e.enumsortorder
    `);
    expect(enumRows.map((r) => r.enumlabel)).toEqual([
      "algorithms",
      "system-design",
      "fundamentals",
      "machine-learning",
      "data-engineering",
      "infrastructure",
      "behavioral",
    ]);

    const columnRows = await db.execute<{
      data_type: string;
      is_nullable: "YES" | "NO";
      udt_name: string;
    }>(sql`
      SELECT data_type, is_nullable, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'topics'
        AND column_name = 'category'
    `);
    expect(columnRows).toEqual([
      {
        data_type: "USER-DEFINED",
        is_nullable: "YES",
        udt_name: "topic_category",
      },
    ]);
  });
});
