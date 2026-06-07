// Topic browse reads (Sprint 5): the /topics index grouping + counts, the
// topic→companies nav, the topic question list (with the company-scoped filter
// behind /topics/[topic]/[company]), the cell-density count the sparse-data
// fallback reads, and the company top-topics rollup. Like browse.test, every
// case clears interview_reports in beforeEach so the COUNT-based reads are
// deterministic; this suite's taxonomy is isolated by its own slugs and torn
// down in afterAll. Index/company reads are asserted by *finding* this suite's
// rows, never by total length, so other suites' rows can't perturb them.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  companies,
  countReportsForTopic,
  createReport,
  getOrCreateUserByClerkId,
  getTopicBySlug,
  interviewReports,
  listCompaniesForTopic,
  listQuestionsForTopic,
  listTopTopicsForCompany,
  listTopicsForIndex,
  type ReportWriteInput,
  roles,
  topics,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

const OWNER_CLERK = "clerk_topics_owner";

describe("topic browse reads", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let ownerId: string;
  let companyAId: string; // "tbco-a"
  let companyBId: string; // "tbco-b"
  let sweId: string;
  let arraysId: string; // active, gets questions
  let graphsId: string; // active, gets questions at companyB only
  let emptyId: string; // active, never tagged → reportCount 0 in the index
  let pendingId: string; // pending → never a public topic page

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    ownerId = (await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK })).id;

    companyAId = (
      await db
        .insert(companies)
        .values({ slug: "tbco-a", name: "TopicCo A", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    companyBId = (
      await db
        .insert(companies)
        .values({ slug: "tbco-b", name: "TopicCo B", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    sweId = (
      await db
        .insert(roles)
        .values({ slug: "tbswe", name: "Topic SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    arraysId = (
      await db
        .insert(topics)
        .values({
          slug: "tb-arrays",
          name: "TB Arrays",
          status: "active",
          category: "algorithms",
        })
        .returning({ id: topics.id })
    )[0]!.id;
    graphsId = (
      await db
        .insert(topics)
        .values({
          slug: "tb-graphs",
          name: "TB Graphs",
          status: "active",
          category: "algorithms",
        })
        .returning({ id: topics.id })
    )[0]!.id;
    emptyId = (
      await db
        .insert(topics)
        .values({
          slug: "tb-empty",
          name: "TB Empty",
          status: "active",
          category: "system-design",
        })
        .returning({ id: topics.id })
    )[0]!.id;
    pendingId = (
      await db
        .insert(topics)
        .values({ slug: "tb-pending", name: "TB Pending", status: "pending" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    await db
      .delete(interviewReports)
      .where(eq(interviewReports.createdByUserId, ownerId));
    await db
      .delete(topics)
      .where(inArray(topics.id, [arraysId, graphsId, emptyId, pendingId]));
    await db.delete(roles).where(eq(roles.id, sweId));
    await db
      .delete(companies)
      .where(inArray(companies.id, [companyAId, companyBId]));
    await db.delete(users).where(eq(users.id, ownerId));
    await close();
  });

  beforeEach(async () => {
    await db.delete(interviewReports);
  });

  // Insert one report; each entry in `questions` is a question's topic-id list.
  // Defaults to companyA / sweId / active / offer.
  async function makeReport(opts: {
    companyId?: string;
    questions: string[][];
    status?: ReportWriteInput["status"];
  }): Promise<string> {
    const input: ReportWriteInput = {
      createdByUserId: ownerId,
      companyId: opts.companyId ?? companyAId,
      canonicalRoleId: sweId,
      level: "L4",
      levelId: null,
      interviewMonth: "2026-02",
      outcome: "offer",
      displayAttribution: "anonymous",
      status: opts.status ?? "active",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: "Round.",
          questions: opts.questions.map((topicIds, i) => ({
            prose: `Q${i} prose.`,
            topicIds,
          })),
        },
      ],
    };
    const { id } = await createReport(db, input);
    return id;
  }

  it("getTopicBySlug returns active rows; null for pending or missing", async () => {
    const t = await getTopicBySlug(db, "tb-arrays");
    expect(t?.id).toBe(arraysId);
    expect(t?.name).toBe("TB Arrays");
    expect(await getTopicBySlug(db, "tb-pending")).toBeNull();
    expect(await getTopicBySlug(db, "tb-nope")).toBeNull();
  });

  it("listTopicsForIndex carries category + visible counts; 0 for untagged; pending excluded", async () => {
    // One report, two questions both tagged arrays → questionCount 2, reportCount 1.
    await makeReport({ questions: [[arraysId], [arraysId]] });
    // A second report tags arrays once more → reportCount 2 for arrays.
    await makeReport({ questions: [[arraysId]] });
    // A non-visible report must not count.
    await makeReport({ questions: [[arraysId]], status: "pending_moderation" });

    const index = await listTopicsForIndex(db);
    const arrays = index.find((t) => t.slug === "tb-arrays");
    const empty = index.find((t) => t.slug === "tb-empty");
    const pending = index.find((t) => t.slug === "tb-pending");

    expect(arrays?.category).toBe("algorithms");
    expect(arrays?.questionCount).toBe(3);
    expect(arrays?.reportCount).toBe(2);
    // Active-but-untagged topic is present with zero counts (the index lists the
    // whole curated taxonomy).
    expect(empty?.category).toBe("system-design");
    expect(empty?.reportCount).toBe(0);
    expect(empty?.questionCount).toBe(0);
    // Pending topic is never in the index.
    expect(pending).toBeUndefined();
  });

  it("listCompaniesForTopic lists companies with the topic, busiest first, visible only", async () => {
    // companyA: two reports touch arrays; companyB: one.
    await makeReport({ companyId: companyAId, questions: [[arraysId]] });
    await makeReport({ companyId: companyAId, questions: [[arraysId]] });
    await makeReport({ companyId: companyBId, questions: [[arraysId]] });
    // companyB also has a graphs report (shouldn't count toward arrays).
    await makeReport({ companyId: companyBId, questions: [[graphsId]] });
    // A non-visible companyA arrays report must not count.
    await makeReport({
      companyId: companyAId,
      questions: [[arraysId]],
      status: "deleted",
    });

    const cos = await listCompaniesForTopic(db, arraysId);
    expect(cos.map((c) => c.id)).toEqual([companyAId, companyBId]); // 2 before 1
    expect(cos.find((c) => c.id === companyAId)?.reportCount).toBe(2);
    expect(cos.find((c) => c.id === companyBId)?.reportCount).toBe(1);

    // graphs is only at companyB.
    const graphsCos = await listCompaniesForTopic(db, graphsId);
    expect(graphsCos.map((c) => c.id)).toEqual([companyBId]);
  });

  it("listQuestionsForTopic returns tagged questions; companyId narrows; total rides along", async () => {
    await makeReport({
      companyId: companyAId,
      questions: [[arraysId], [graphsId]],
    }); // 1 arrays Q at A
    await makeReport({ companyId: companyBId, questions: [[arraysId]] }); // 1 arrays Q at B

    const all = await listQuestionsForTopic(db, arraysId, {
      limit: 20,
      offset: 0,
    });
    expect(all.total).toBe(2);
    expect(all.items).toHaveLength(2);
    // Only arrays-tagged questions surface (the graphs question is excluded).
    expect(all.items.every((q) => q.prose.startsWith("Q"))).toBe(true);
    expect(new Set(all.items.map((q) => q.companySlug))).toEqual(
      new Set(["tbco-a", "tbco-b"]),
    );

    // Scoped to companyA → only its question.
    const scoped = await listQuestionsForTopic(db, arraysId, {
      limit: 20,
      offset: 0,
      companyId: companyAId,
    });
    expect(scoped.total).toBe(1);
    expect(scoped.items[0]!.companySlug).toBe("tbco-a");
    expect(scoped.items[0]!.roleName).toBe("Topic SWE");
  });

  it("listQuestionsForTopic paginates (window total independent of the page)", async () => {
    // 3 reports, one arrays question each → 3 questions.
    await makeReport({ questions: [[arraysId]] });
    await makeReport({ questions: [[arraysId]] });
    await makeReport({ questions: [[arraysId]] });

    const page1 = await listQuestionsForTopic(db, arraysId, {
      limit: 2,
      offset: 0,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    const page2 = await listQuestionsForTopic(db, arraysId, {
      limit: 2,
      offset: 2,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);
  });

  it("countReportsForTopic counts distinct visible reports, optionally company-scoped", async () => {
    // One report, two arrays questions → still ONE report.
    await makeReport({ companyId: companyAId, questions: [[arraysId], [arraysId]] });
    await makeReport({ companyId: companyBId, questions: [[arraysId]] });
    await makeReport({
      companyId: companyAId,
      questions: [[arraysId]],
      status: "pending_moderation",
    }); // not visible

    expect(await countReportsForTopic(db, arraysId)).toBe(2);
    expect(await countReportsForTopic(db, arraysId, companyAId)).toBe(1);
    expect(await countReportsForTopic(db, arraysId, companyBId)).toBe(1);
    expect(await countReportsForTopic(db, emptyId)).toBe(0);
  });

  it("listTopTopicsForCompany ranks a company's topics by distinct reports, limit respected", async () => {
    // companyA: arrays in 2 reports, graphs in 1.
    await makeReport({ companyId: companyAId, questions: [[arraysId], [graphsId]] });
    await makeReport({ companyId: companyAId, questions: [[arraysId]] });
    // companyB arrays report must not bleed into companyA's rollup.
    await makeReport({ companyId: companyBId, questions: [[arraysId]] });

    const top = await listTopTopicsForCompany(db, companyAId, 10);
    expect(top.map((t) => t.slug)).toEqual(["tb-arrays", "tb-graphs"]);
    expect(top.find((t) => t.slug === "tb-arrays")?.reportCount).toBe(2);
    expect(top.find((t) => t.slug === "tb-graphs")?.reportCount).toBe(1);

    // limit caps the row count.
    const capped = await listTopTopicsForCompany(db, companyAId, 1);
    expect(capped).toHaveLength(1);
    expect(capped[0]!.slug).toBe("tb-arrays");
  });
});
