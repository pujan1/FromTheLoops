// Aggregation pipeline (Sprint 3 Day 1–2): the aggregates_company_role_level
// summary table + refresh_aggregate_cell / refresh_all_aggregates procs.
//
// Coverage: per-cell recompute correctness (counts, outcome buckets,
// trust-weighted volume, median round count, modal round sequence, top topics),
// the active-and-not-deleted visibility filter, cell-emptying on the last
// delete, the full backfill, and the per-cell refresh staying well under the
// 60s budget on a busy cell. Plus a drift guard tying the migration to its
// readable views/ source.

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type AggregateCellKey,
  createReport,
  getAggregate,
  getOrCreateUserByClerkId,
  refreshAggregateCell,
  refreshAllAggregates,
  type ReportWriteInput,
  softDeleteReport,
} from "../src/index.js";
import {
  companies,
  companyLevels,
  interviewReports,
  roles,
  topics,
} from "../src/schema/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

const OWNER_CLERK = "clerk_agg_owner";

describe("company/role/level aggregates", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let ownerId: string;
  let companyId: string;
  let roleId: string;
  let levelId: string;
  let arraysId: string;
  let graphsId: string;

  // The cell every correctness case writes into.
  let cellA: AggregateCellKey;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    ownerId = (await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK })).id;

    companyId = (
      await db
        .insert(companies)
        .values({ slug: "aggco", name: "AggCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    levelId = (
      await db
        .insert(companyLevels)
        .values({ companyId, slug: "l5", name: "L5", orderIndex: 0 })
        .returning({ id: companyLevels.id })
    )[0]!.id;
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "aggswe", name: "Agg SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    arraysId = (
      await db
        .insert(topics)
        .values({ slug: "agg-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
    graphsId = (
      await db
        .insert(topics)
        .values({ slug: "agg-graphs", name: "Graphs", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;

    cellA = { companyId, canonicalRoleId: roleId, level: "L5" };
  });

  afterAll(async () => {
    await db.delete(interviewReports).where(eq(interviewReports.createdByUserId, ownerId));
    await db.delete(companyLevels).where(eq(companyLevels.id, levelId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(topics).where(eq(topics.id, arraysId));
    await db.delete(topics).where(eq(topics.id, graphsId));
    await close();
  });

  beforeEach(async () => {
    await db.delete(interviewReports);
    // refresh the empty cell so any prior row is cleared.
    await refreshAggregateCell(db, cellA);
  });

  // Create an active report in cellA, optionally marking it evidence-verified.
  async function makeReport(
    overrides: Partial<ReportWriteInput>,
    opts: { verified?: boolean } = {},
  ): Promise<string> {
    const input: ReportWriteInput = {
      createdByUserId: ownerId,
      companyId,
      canonicalRoleId: roleId,
      level: "L5",
      levelId,
      interviewMonth: "2026-05",
      outcome: "offer",
      displayAttribution: "anonymous",
      status: "active",
      rounds: [],
      ...overrides,
    };
    const { id } = await createReport(db, input);
    if (opts.verified) {
      await db
        .update(interviewReports)
        .set({ evidenceVerified: true })
        .where(eq(interviewReports.id, id));
    }
    return id;
  }

  // The three-report fixture used by several cases.
  //   r1 verified  offer  [coding(q:Arrays, q:Arrays+Graphs), behavioral()]
  //   r2 unverified reject [coding(q:Arrays)]
  //   r3 unverified offer  [coding(q:Graphs), behavioral()]
  async function seedThree(): Promise<void> {
    await makeReport(
      {
        outcome: "offer",
        rounds: [
          {
            roundType: "onsite-coding",
            rating: "positive",
            experienceProse: null,
            questions: [
              { prose: "q1", topicIds: [arraysId] },
              { prose: "q2", topicIds: [arraysId, graphsId] },
            ],
          },
          {
            roundType: "onsite-behavioral",
            rating: "mixed",
            experienceProse: null,
            questions: [],
          },
        ],
      },
      { verified: true },
    );
    await makeReport({
      outcome: "reject",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "negative",
          experienceProse: null,
          questions: [{ prose: "q3", topicIds: [arraysId] }],
        },
      ],
    });
    await makeReport({
      outcome: "offer",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: null,
          questions: [{ prose: "q4", topicIds: [graphsId] }],
        },
        {
          roundType: "onsite-behavioral",
          rating: "positive",
          experienceProse: null,
          questions: [],
        },
      ],
    });
  }

  it("computes counts, outcomes, and trust-weighted volume", async () => {
    await seedThree();
    await refreshAggregateCell(db, cellA);
    const agg = await getAggregate(db, cellA);
    expect(agg).not.toBeNull();
    expect(agg!.reportCount).toBe(3);
    expect(agg!.outcome).toEqual({
      offer: 2,
      reject: 1,
      withdrew: 0,
      ghosted: 0,
      pending: 0,
    });
    // 1.0 (verified) + 0.3 + 0.3 (unverified) = 1.6
    expect(agg!.trustWeightedCount).toBeCloseTo(1.6, 5);
  });

  it("computes median round count and the modal round-type sequence", async () => {
    await seedThree();
    await refreshAggregateCell(db, cellA);
    const agg = await getAggregate(db, cellA);
    // round counts [2, 1, 2] → median 2
    expect(agg!.medianRoundCount).toBe(2);
    // sequences [coding,behavioral] ×2 vs [coding] ×1 → mode is the pair
    expect(agg!.modeRoundSequence).toEqual([
      "onsite-coding",
      "onsite-behavioral",
    ]);
  });

  it("ranks top topics by trust-weighted frequency", async () => {
    await seedThree();
    await refreshAggregateCell(db, cellA);
    const agg = await getAggregate(db, cellA);
    const top = agg!.topTopics;
    expect(top.map((t) => t.slug)).toEqual(["agg-arrays", "agg-graphs"]);
    const arrays = top[0]!;
    // Arrays: r1 ×2 (w1.0) + r2 ×1 (w0.3) → count 3, weighted 2.3
    expect(arrays.count).toBe(3);
    expect(arrays.weighted_count).toBeCloseTo(2.3, 5);
    const graphs = top[1]!;
    // Graphs: r1 ×1 (w1.0) + r3 ×1 (w0.3) → count 2, weighted 1.3
    expect(graphs.count).toBe(2);
    expect(graphs.weighted_count).toBeCloseTo(1.3, 5);
  });

  it("excludes pending_moderation and soft-deleted reports", async () => {
    await seedThree(); // 3 active
    // a held report and a soft-deleted one in the same cell must not count.
    await makeReport({ outcome: "offer", status: "pending_moderation" });
    const deletedId = await makeReport({ outcome: "reject" });
    await softDeleteReport(db, deletedId, ownerId);

    await refreshAggregateCell(db, cellA);
    const agg = await getAggregate(db, cellA);
    expect(agg!.reportCount).toBe(3);
    expect(agg!.outcome.offer).toBe(2);
    expect(agg!.outcome.reject).toBe(1);
  });

  it("removes the cell row once its last live report is deleted", async () => {
    const id = await makeReport({ outcome: "offer" });
    await refreshAggregateCell(db, cellA);
    expect(await getAggregate(db, cellA)).not.toBeNull();

    await softDeleteReport(db, id, ownerId);
    await refreshAggregateCell(db, cellA);
    expect(await getAggregate(db, cellA)).toBeNull();
  });

  it("backfills every distinct live cell via refresh_all_aggregates", async () => {
    // two cells: L5 (seedThree) and a second level L6 with one report.
    await seedThree();
    await makeReport({ level: "L6", outcome: "offer" });

    const n = await refreshAllAggregates(db);
    expect(n).toBe(2);
    expect(await getAggregate(db, cellA)).not.toBeNull();
    const cellB: AggregateCellKey = {
      companyId,
      canonicalRoleId: roleId,
      level: "L6",
    };
    const aggB = await getAggregate(db, cellB);
    expect(aggB!.reportCount).toBe(1);
  });

  it("refreshes a busy cell well within the 60s budget", async () => {
    const N = 60;
    for (let i = 0; i < N; i++) {
      await makeReport(
        {
          outcome: i % 2 === 0 ? "offer" : "reject",
          rounds: [
            {
              roundType: "onsite-coding",
              rating: "positive",
              experienceProse: null,
              questions: [{ prose: `q${i}`, topicIds: [arraysId, graphsId] }],
            },
          ],
        },
        { verified: i % 3 === 0 },
      );
    }
    const t0 = performance.now();
    await refreshAggregateCell(db, cellA);
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`refresh of a ${N}-report cell took ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(10_000); // exit criterion is 60s; huge margin
    const agg = await getAggregate(db, cellA);
    expect(agg!.reportCount).toBe(N);
  });

  // Guards against the migration and its readable source diverging. We compare
  // the executable statements (everything from the first CREATE on), normalized
  // for whitespace, so only header comments may differ.
  it("keeps migration 0008 byte-identical to views/ source", () => {
    const exec = (path: string): string => {
      const raw = readFileSync(new URL(path, import.meta.url), "utf8");
      const fromFirstCreate = raw.slice(raw.search(/^CREATE/m));
      return fromFirstCreate.replace(/\s+/g, " ").trim();
    };
    const migration = exec(
      "../src/migrations/0008_aggregates_company_role_level.sql",
    );
    const view = exec("../views/aggregates_company_role_level.sql");
    expect(migration).toBe(view);
  });
});
