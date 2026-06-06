// Public browse reads (Sprint 4): slug lookups, the rollup count reads, the
// wedge cell report list, and the public report detail read. Like
// aggregates.test, every case deletes all interview_reports in beforeEach so the
// global COUNT-based rollups are deterministic; taxonomy is isolated by this
// suite's own slugs and torn down in afterAll.

import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  companies,
  companyLevels,
  countActiveReportsForCompanyRole,
  createReport,
  getCompanyBySlug,
  getCompanyStats,
  getCompanyLevelBySlug,
  getPublicReportDetail,
  getOrCreateUserByClerkId,
  getRoleBySlug,
  interviewReports,
  listCompaniesWithReports,
  listLevelsForCompanyRoleWithReports,
  listReportsForCell,
  listReportsForCompany,
  listReportsForRole,
  listRolesForCompanyWithReports,
  type ReportWriteInput,
  roles,
  topics,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

const OWNER_CLERK = "clerk_browse_owner";

describe("public browse reads", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let ownerId: string;
  let companyAId: string; // "browseco" — gets reports
  let companyBId: string; // "browseco-empty" — never gets reports
  let pendingCompanyId: string;
  let sweId: string;
  let feId: string;
  let l4Id: string;
  let topicId: string;
  let topicBId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    ownerId = (await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK })).id;
    await db
      .update(users)
      .set({ displayName: "Casey B." })
      .where(eq(users.id, ownerId));

    companyAId = (
      await db
        .insert(companies)
        .values({ slug: "browseco", name: "BrowseCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    companyBId = (
      await db
        .insert(companies)
        .values({ slug: "browseco-empty", name: "EmptyCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    pendingCompanyId = (
      await db
        .insert(companies)
        .values({ slug: "browseco-pending", name: "PendCo", status: "pending" })
        .returning({ id: companies.id })
    )[0]!.id;
    l4Id = (
      await db
        .insert(companyLevels)
        .values({ companyId: companyAId, slug: "l4", name: "L4", orderIndex: 0 })
        .returning({ id: companyLevels.id })
    )[0]!.id;
    await db.insert(companyLevels).values({
      companyId: companyAId,
      slug: "l5",
      name: "L5",
      orderIndex: 1,
    });
    sweId = (
      await db
        .insert(roles)
        .values({ slug: "browseswe", name: "Browse SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    feId = (
      await db
        .insert(roles)
        .values({ slug: "browsefe", name: "Browse FE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "browse-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
    topicBId = (
      await db
        .insert(topics)
        .values({ slug: "browse-graphs", name: "Graphs", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    await db
      .delete(interviewReports)
      .where(eq(interviewReports.createdByUserId, ownerId));
    await db.delete(companyLevels).where(eq(companyLevels.companyId, companyAId));
    await db.delete(roles).where(eq(roles.id, sweId));
    await db.delete(roles).where(eq(roles.id, feId));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(topics).where(eq(topics.id, topicBId));
    await db.delete(companies).where(eq(companies.id, companyAId));
    await db.delete(companies).where(eq(companies.id, companyBId));
    await db.delete(companies).where(eq(companies.id, pendingCompanyId));
    await db.delete(users).where(eq(users.id, ownerId));
    await close();
  });

  beforeEach(async () => {
    await db.delete(interviewReports);
  });

  // Insert an active report (with one round + one tagged question so the detail
  // tree + round count are exercised). Overrides let a case tweak the cell,
  // outcome, attribution, status.
  async function makeReport(
    overrides: Partial<ReportWriteInput> = {},
  ): Promise<string> {
    const input: ReportWriteInput = {
      createdByUserId: ownerId,
      companyId: companyAId,
      canonicalRoleId: sweId,
      level: "L4",
      levelId: l4Id,
      interviewMonth: "2026-02",
      outcome: "offer",
      displayAttribution: "anonymous",
      status: "active",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: "Solid loop.",
          questions: [{ prose: "Two-sum variant.", topicIds: [topicId] }],
        },
      ],
      ...overrides,
    };
    const { id } = await createReport(db, input);
    return id;
  }

  it("getCompanyBySlug returns active rows; null for pending or missing", async () => {
    const co = await getCompanyBySlug(db, "browseco");
    expect(co?.id).toBe(companyAId);
    expect(co?.name).toBe("BrowseCo");
    expect(await getCompanyBySlug(db, "browseco-pending")).toBeNull();
    expect(await getCompanyBySlug(db, "does-not-exist")).toBeNull();
  });

  it("getRoleBySlug + getCompanyLevelBySlug resolve active rows, company-scoped", async () => {
    expect((await getRoleBySlug(db, "browseswe"))?.id).toBe(sweId);
    const lvl = await getCompanyLevelBySlug(db, companyAId, "l4");
    expect(lvl?.name).toBe("L4");
    // Wrong company → not found (level slugs are company-scoped).
    expect(await getCompanyLevelBySlug(db, companyBId, "l4")).toBeNull();
  });

  it("listCompaniesWithReports excludes empty companies + counts visible only", async () => {
    await makeReport();
    await makeReport();
    await makeReport({ status: "pending_moderation" }); // not visible
    const list = await listCompaniesWithReports(db);
    const a = list.find((c) => c.id === companyAId);
    expect(a?.reportCount).toBe(2);
    // EmptyCo + PendCo have no visible reports → absent.
    expect(list.some((c) => c.id === companyBId)).toBe(false);
    expect(list.some((c) => c.id === pendingCompanyId)).toBe(false);
  });

  it("listRolesForCompanyWithReports groups by role within the company", async () => {
    await makeReport({ canonicalRoleId: sweId });
    await makeReport({ canonicalRoleId: sweId });
    await makeReport({ canonicalRoleId: feId });
    const roleRows = await listRolesForCompanyWithReports(db, companyAId);
    expect(roleRows.find((r) => r.id === sweId)?.reportCount).toBe(2);
    expect(roleRows.find((r) => r.id === feId)?.reportCount).toBe(1);
  });

  it("listLevelsForCompanyRoleWithReports orders by ladder; null slug for custom levels", async () => {
    await makeReport({ level: "L4", levelId: l4Id });
    await makeReport({ level: "L4", levelId: l4Id });
    // A custom level with no company_levels row → slug null, no canonical URL.
    await makeReport({ level: "Staff (custom)", levelId: null });
    const levels = await listLevelsForCompanyRoleWithReports(db, companyAId, sweId);
    const l4 = levels.find((l) => l.name === "L4");
    const custom = levels.find((l) => l.name === "Staff (custom)");
    expect(l4?.slug).toBe("l4");
    expect(l4?.reportCount).toBe(2);
    expect(custom?.slug).toBeNull();
    expect(custom?.reportCount).toBe(1);
    // L4 (orderIndex 0) sorts before the null-order custom level.
    expect(levels[0]!.name).toBe("L4");
  });

  it("countActiveReportsForCompanyRole sums all levels, visible only", async () => {
    await makeReport({ level: "L4", levelId: l4Id });
    await makeReport({ level: "L5", levelId: null }); // different level, same role
    await makeReport({ canonicalRoleId: feId }); // different role — excluded
    await makeReport({ status: "pending_moderation" }); // not visible — excluded
    const n = await countActiveReportsForCompanyRole(db, companyAId, sweId);
    expect(n).toBe(2);
    // A role with no visible reports counts zero.
    expect(await countActiveReportsForCompanyRole(db, companyAId, feId)).toBe(1);
  });

  it("listReportsForRole spans all levels; level facet narrows to one", async () => {
    await makeReport({ level: "L4", levelId: l4Id });
    await makeReport({ level: "L5", levelId: null });
    await makeReport({ level: "Unspecified", levelId: null });
    const cell = { companyId: companyAId, canonicalRoleId: sweId };
    // No level filter → every level, incl. Unspecified.
    const all = await listReportsForRole(db, cell, { limit: 20, offset: 0 });
    expect(all.total).toBe(3);
    expect(new Set(all.items.map((i) => i.level))).toEqual(
      new Set(["L4", "L5", "Unspecified"]),
    );
    // Each item carries its own role (slug/name) for cross-surface reuse.
    expect(all.items[0]!.roleSlug).toBe("browseswe");
    // Level facet pins to one level's text.
    const l4 = await listReportsForRole(db, cell, {
      limit: 20,
      offset: 0,
      filters: { level: "L4" },
    });
    expect(l4.total).toBe(1);
    expect(l4.items[0]!.level).toBe("L4");
  });

  it("listReportsForCompany feeds across all roles, newest first, outcome-filterable", async () => {
    await makeReport({ canonicalRoleId: sweId, outcome: "offer" });
    await makeReport({ canonicalRoleId: feId, outcome: "reject" });
    await makeReport({ canonicalRoleId: feId, outcome: "offer" });
    const all = await listReportsForCompany(db, companyAId, { limit: 20, offset: 0 });
    expect(all.total).toBe(3);
    // Mixed roles surface in one feed.
    expect(new Set(all.items.map((i) => i.roleSlug))).toEqual(
      new Set(["browseswe", "browsefe"]),
    );
    // Outcome facet narrows the feed (and the window total).
    const offers = await listReportsForCompany(db, companyAId, {
      limit: 20,
      offset: 0,
      filters: { outcome: "offer" },
    });
    expect(offers.total).toBe(2);
  });

  it("getCompanyStats counts visible reports + distinct roles", async () => {
    await makeReport({ canonicalRoleId: sweId });
    await makeReport({ canonicalRoleId: sweId });
    await makeReport({ canonicalRoleId: feId });
    await makeReport({ canonicalRoleId: feId, status: "pending_moderation" }); // hidden
    const stats = await getCompanyStats(db, companyAId);
    expect(stats.reportCount).toBe(3);
    expect(stats.roleCount).toBe(2);
  });

  it("listReportsForCell paginates with a window total + resolves attribution", async () => {
    await makeReport({ displayAttribution: "display_name" });
    await makeReport({ displayAttribution: "anonymous" });
    await makeReport({ displayAttribution: "anonymous" });
    const cell = { companyId: companyAId, canonicalRoleId: sweId, level: "L4" };
    const page1 = await listReportsForCell(db, cell, { limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]!.roundCount).toBe(1);
    const page2 = await listReportsForCell(db, cell, { limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(1);
    // The display_name report carries the author name; anonymous ones are null.
    const named = [...page1.items, ...page2.items].filter(
      (i) => i.authorName === "Casey B.",
    );
    const anon = [...page1.items, ...page2.items].filter(
      (i) => i.authorName === null,
    );
    expect(named).toHaveLength(1);
    expect(anon).toHaveLength(2);
  });

  it("listReportsForCell returns each report's distinct topics, name-sorted", async () => {
    // One report whose two rounds touch Arrays + Graphs (Graphs twice → still
    // distinct once). Names sort A < G.
    await makeReport({
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: "Coding.",
          questions: [{ prose: "Arrays Q.", topicIds: [topicId, topicBId] }],
        },
        {
          roundType: "onsite-system-design",
          rating: "mixed",
          experienceProse: "Design.",
          questions: [{ prose: "Graphs Q.", topicIds: [topicBId] }],
        },
      ],
    });
    const cell = { companyId: companyAId, canonicalRoleId: sweId, level: "L4" };
    const { items } = await listReportsForCell(db, cell, { limit: 20, offset: 0 });
    expect(items[0]!.topics).toEqual([
      { slug: "browse-arrays", name: "Arrays" },
      { slug: "browse-graphs", name: "Graphs" },
    ]);
  });

  it("listReportsForCell filters by outcome, round-type, topic, and trust tier", async () => {
    const cell = { companyId: companyAId, canonicalRoleId: sweId, level: "L4" };

    // An offer with a take-home round tagged Graphs.
    const offerId = await makeReport({
      outcome: "offer",
      rounds: [
        {
          roundType: "take-home",
          rating: "positive",
          experienceProse: "Take-home.",
          questions: [{ prose: "Graph traversal.", topicIds: [topicBId] }],
        },
      ],
    });
    // A reject with an onsite-coding round tagged Arrays (makeReport default).
    await makeReport({ outcome: "reject" });

    // Outcome facet.
    const offers = await listReportsForCell(db, cell, {
      limit: 20,
      offset: 0,
      filters: { outcome: "offer" },
    });
    expect(offers.total).toBe(1);
    expect(offers.items[0]!.id).toBe(offerId);

    // Round-type facet (EXISTS over the report's rounds).
    const takeHome = await listReportsForCell(db, cell, {
      limit: 20,
      offset: 0,
      filters: { roundType: "take-home" },
    });
    expect(takeHome.items.map((i) => i.id)).toEqual([offerId]);

    // Topic facet (ANY of the slugs).
    const graphs = await listReportsForCell(db, cell, {
      limit: 20,
      offset: 0,
      filters: { topics: ["browse-graphs"] },
    });
    expect(graphs.items.map((i) => i.id)).toEqual([offerId]);

    // Trust tier: mark the offer evidence-verified, then require it.
    await db
      .update(interviewReports)
      .set({ evidenceVerified: true })
      .where(eq(interviewReports.id, offerId));
    const verified = await listReportsForCell(db, cell, {
      limit: 20,
      offset: 0,
      filters: { verifiedOnly: true },
    });
    expect(verified.items.map((i) => i.id)).toEqual([offerId]);

    // Window total reflects the filter, so pagination is over the filtered set.
    const none = await listReportsForCell(db, cell, {
      limit: 20,
      offset: 0,
      filters: { outcome: "ghosted" },
    });
    expect(none.total).toBe(0);
    expect(none.items).toHaveLength(0);
  });

  it("getPublicReportDetail returns active reports with their full tree", async () => {
    const id = await makeReport();
    const detail = await getPublicReportDetail(db, id);
    expect(detail).not.toBeNull();
    expect(detail!.company.slug).toBe("browseco");
    expect(detail!.role.slug).toBe("browseswe");
    expect(detail!.rounds).toHaveLength(1);
    expect(detail!.rounds[0]!.questions[0]!.topics[0]!.slug).toBe("browse-arrays");
  });

  it("getPublicReportDetail hides pending + deleted reports (404 source)", async () => {
    const pending = await makeReport({ status: "pending_moderation" });
    expect(await getPublicReportDetail(db, pending)).toBeNull();

    const active = await makeReport();
    await db
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(interviewReports.id, active));
    expect(await getPublicReportDetail(db, active)).toBeNull();
  });
});
