// Search-index reads + search-consumer drain markers (Sprint 3 Day 6).
//
// getReportForIndex is what the Typesense indexer reads; the load-bearing
// property is the visibility filter — it must return the full denormalised
// shape for an active report and NULL for a pending_moderation or soft-deleted
// one, so a hidden report can never reach the public search index. Plus the
// company/topic backfill count reads and the search_processed_at drain trio
// (the exact mirror of the aggregate consumer's, asserted independently).

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimUnprocessedSearchEvents,
  countUnprocessedSearchEvents,
  createReport,
  getOrCreateUserByClerkId,
  getReportForIndex,
  listActiveCompaniesForIndex,
  listActiveTopicsForIndex,
  listVisibleReportIds,
  markSearchEventProcessed,
  type ReportWriteInput,
  softDeleteReport,
} from "../src/index.js";
import {
  companies,
  companyLevels,
  events,
  interviewReports,
  roles,
  topics,
} from "../src/schema/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

const OWNER_CLERK = "clerk_search_owner";

describe("search-index reads", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let ownerId: string;
  let companyId: string;
  let roleId: string;
  let levelId: string;
  let arraysId: string;
  let graphsId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    ownerId = (await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK })).id;

    companyId = (
      await db
        .insert(companies)
        .values({ slug: "srchco", name: "SearchCo", status: "active" })
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
        .values({ slug: "srchswe", name: "Search SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    arraysId = (
      await db
        .insert(topics)
        .values({ slug: "srch-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
    graphsId = (
      await db
        .insert(topics)
        .values({ slug: "srch-graphs", name: "Graphs", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
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
    await db.delete(events);
    await db.delete(interviewReports);
  });

  async function makeReport(
    overrides: Partial<ReportWriteInput> = {},
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
      rounds: [
        {
          roundType: "onsite-system-design",
          rating: "positive",
          experienceProse: "Designed a rate limiter.",
          questions: [{ prose: "How to shard a counter?", topicIds: [arraysId, graphsId] }],
        },
      ],
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

  it("returns the denormalised shape for an active report", async () => {
    const id = await makeReport({}, { verified: true });
    const input = await getReportForIndex(db, id);
    expect(input).not.toBeNull();
    expect(input!.company).toMatchObject({ id: companyId, slug: "srchco", name: "SearchCo" });
    expect(input!.role).toMatchObject({ id: roleId, slug: "srchswe", name: "Search SWE" });
    expect(input!.level).toBe("L5");
    expect(input!.outcome).toBe("offer");
    expect(input!.evidenceVerified).toBe(true);
    expect(input!.interviewMonth).toBe("2026-05");
    expect(input!.roundTypes).toEqual(["onsite-system-design"]);
    // Both question tags, deduped by id.
    expect(new Set(input!.topics.map((t) => t.slug))).toEqual(
      new Set(["srch-arrays", "srch-graphs"]),
    );
    // Full-text body = round experience prose + question prose.
    expect(input!.text).toContain("rate limiter");
    expect(input!.text).toContain("shard a counter");
  });

  it("carries a null outcome through (pending interview)", async () => {
    const id = await makeReport({ outcome: null });
    const input = await getReportForIndex(db, id);
    expect(input!.outcome).toBeNull();
  });

  it("returns null for a pending_moderation report (never indexed)", async () => {
    const id = await makeReport({ status: "pending_moderation" });
    expect(await getReportForIndex(db, id)).toBeNull();
  });

  it("returns null for a soft-deleted report", async () => {
    const id = await makeReport();
    await softDeleteReport(db, id, ownerId);
    expect(await getReportForIndex(db, id)).toBeNull();
  });

  it("returns null for a missing report id", async () => {
    expect(
      await getReportForIndex(db, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("listVisibleReportIds includes only active, non-deleted reports", async () => {
    const active = await makeReport();
    await makeReport({ status: "pending_moderation" });
    const deleted = await makeReport();
    await softDeleteReport(db, deleted, ownerId);

    const ids = await listVisibleReportIds(db);
    expect(ids).toContain(active);
    expect(ids).not.toContain(deleted);
    expect(ids).toHaveLength(1);
  });

  it("listActiveCompaniesForIndex counts only visible reports", async () => {
    await makeReport();
    await makeReport({ status: "pending_moderation" });
    const rows = await listActiveCompaniesForIndex(db);
    const co = rows.find((r) => r.id === companyId);
    expect(co).toBeDefined();
    expect(co!.slug).toBe("srchco");
    expect(co!.reportCount).toBe(1); // the pending one doesn't count
  });

  it("listActiveTopicsForIndex counts questions across visible reports", async () => {
    await makeReport(); // one question tagged with both arrays + graphs
    const rows = await listActiveTopicsForIndex(db);
    const arrays = rows.find((r) => r.id === arraysId);
    const graphs = rows.find((r) => r.id === graphsId);
    expect(arrays!.questionCount).toBe(1);
    expect(graphs!.questionCount).toBe(1);
  });

  it("search drain trio mirrors the aggregate consumer independently", async () => {
    // createReport emits a 'created' event in-tx → one unprocessed for search.
    await makeReport();
    expect(await countUnprocessedSearchEvents(db)).toBe(1);

    const pending = await claimUnprocessedSearchEvents(db, 10);
    expect(pending).toHaveLength(1);

    const flipped = await markSearchEventProcessed(db, pending[0]!.id);
    expect(flipped).toBe(true);
    expect(await countUnprocessedSearchEvents(db)).toBe(0);

    // Idempotent — re-marking an already-drained event is a no-op.
    expect(await markSearchEventProcessed(db, pending[0]!.id)).toBe(false);
  });
});
