// Verifies the Sprint 4 wedge-page fixtures: the right volume + density of
// active seed_dummy reports land, the submission invariants hold (≥1 round per
// report, ≥1 topic per question), and the seed is idempotent. Uses the shared
// testcontainer like the rest of the suite. No truncate — only this seed
// produces source='seed_dummy' rows, so source-filtered counts are exact
// regardless of what other suites leave behind.

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  companyLevels,
  interviewReports,
  questions,
  questionTopics,
  roles,
  rounds,
  topics,
  users,
} from "../src/schema/index.js";
import { seedCurated } from "../src/seed/curated.js";
import {
  SEED_AUTHORS,
  SEED_CELLS,
  SEED_REPORT_TOTAL,
  seedReports,
} from "../src/seed/reports.js";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("dummy report seed", () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    await seedCurated(db);
    await seedReports(db);
  });

  afterAll(async () => {
    // Tear down in FK order: reports (cascade to children) → authors (RESTRICT
    // until their reports are gone) → the curated taxonomy this suite seeded.
    // Cleaning the curated rows matters because files run serially against a
    // shared container and reports.test raw-inserts a bare `swe` role expecting
    // a clean slate — a leftover curated `swe` would collide. Mirrors
    // seed.test.ts's source-filtered cleanup (DELETE, not TRUNCATE, to avoid an
    // exclusive lock).
    await db
      .delete(interviewReports)
      .where(eq(interviewReports.source, "seed_dummy"));
    await db.delete(users).where(
      inArray(
        users.clerkId,
        SEED_AUTHORS.map((a) => a.clerkId),
      ),
    );
    await db
      .delete(companyLevels)
      .where(eq(companyLevels.source, "seed_curated"));
    await db.delete(companies).where(eq(companies.source, "seed_curated"));
    await db.delete(roles).where(eq(roles.source, "seed_curated"));
    await db.delete(topics).where(eq(topics.source, "seed_curated"));
    await close();
  });

  // Helper: count seed_dummy reports in one (company, role, level) cell.
  async function cellCount(
    company: string,
    role: string,
    level: string,
  ): Promise<number> {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(interviewReports)
      .innerJoin(companies, eq(companies.id, interviewReports.companyId))
      .innerJoin(roles, eq(roles.id, interviewReports.canonicalRoleId))
      .where(
        and(
          eq(companies.slug, company),
          eq(roles.slug, role),
          eq(interviewReports.level, level),
          eq(interviewReports.source, "seed_dummy"),
        ),
      );
    return rows[0]!.n;
  }

  it("meets the sprint-4 dependency floor (≥50 reports, ≥5 companies, ≥3 levels)", () => {
    expect(SEED_REPORT_TOTAL).toBeGreaterThanOrEqual(50);
    expect(new Set(SEED_CELLS.map((c) => c.company)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(SEED_CELLS.map((c) => c.level)).size).toBeGreaterThanOrEqual(3);
  });

  it("inserts exactly SEED_REPORT_TOTAL active seed_dummy reports", async () => {
    const rows = await db
      .select()
      .from(interviewReports)
      .where(eq(interviewReports.source, "seed_dummy"));
    expect(rows).toHaveLength(SEED_REPORT_TOTAL);
    expect(rows.every((r) => r.status === "active")).toBe(true);
    expect(rows.every((r) => r.deletedAt === null)).toBe(true);
    // interviewMonth is always a well-formed YYYY-MM.
    expect(rows.every((r) => /^\d{4}-\d{2}$/.test(r.interviewMonth))).toBe(true);
  });

  it("has both dense (≥10) and sparse (<10) cells for fallback testing", async () => {
    // Dense showcase cell.
    expect(await cellCount("google", "swe", "L4")).toBe(20);
    expect(await cellCount("stripe", "backend", "L4")).toBe(18);
    // Sparse fallback cell.
    expect(await cellCount("databricks", "backend", "L4")).toBe(1);
    expect(await cellCount("openai", "ml", "IC4")).toBe(2);

    const dense = SEED_CELLS.filter((c) => c.count >= 10);
    const sparse = SEED_CELLS.filter((c) => c.count < 10);
    expect(dense.length).toBeGreaterThan(0);
    expect(sparse.length).toBeGreaterThan(0);
  });

  it("gives every report ≥1 round and every question ≥1 topic", async () => {
    // Reports with zero rounds (should be none).
    const reportIds = (
      await db
        .select({ id: interviewReports.id })
        .from(interviewReports)
        .where(eq(interviewReports.source, "seed_dummy"))
    ).map((r) => r.id);
    expect(reportIds.length).toBe(SEED_REPORT_TOTAL);

    const roundRows = await db
      .select({ id: rounds.id, reportId: rounds.reportId })
      .from(rounds)
      .where(inArray(rounds.reportId, reportIds));
    const reportsWithRounds = new Set(roundRows.map((r) => r.reportId));
    expect(reportsWithRounds.size).toBe(SEED_REPORT_TOTAL);

    // Every question has ≥1 topic. Count questions whose id is absent from
    // question_topics — must be zero.
    const roundIds = roundRows.map((r) => r.id);
    const questionRows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(inArray(questions.roundId, roundIds));
    expect(questionRows.length).toBeGreaterThan(0);
    const questionIds = questionRows.map((q) => q.id);
    const tagged = await db
      .selectDistinct({ id: questionTopics.questionId })
      .from(questionTopics)
      .where(inArray(questionTopics.questionId, questionIds));
    expect(tagged.length).toBe(questionIds.length);
  });

  it("is idempotent — re-running keeps the report count stable", async () => {
    await seedReports(db);
    await seedReports(db);
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(interviewReports)
      .where(eq(interviewReports.source, "seed_dummy"));
    expect(rows[0]!.n).toBe(SEED_REPORT_TOTAL);
    // Authors are upserted, not duplicated.
    const authorRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(
        inArray(
          users.clerkId,
          SEED_AUTHORS.map((a) => a.clerkId),
        ),
      );
    expect(authorRows[0]!.n).toBe(SEED_AUTHORS.length);
  });
});
