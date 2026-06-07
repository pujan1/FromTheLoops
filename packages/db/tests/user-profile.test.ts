// User profile reads (Sprint 5, Day 4): the username lookup behind /u/[username]
// resolution, the attributed-only report feed (the privacy boundary —
// anonymous reports never surface on a public profile), and the header stats.
// Like the other browse suites, taxonomy is isolated by this suite's own slugs
// and torn down in afterAll; reports are cleared in beforeEach so the
// COUNT-based stats read deterministically.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  companies,
  createReport,
  getOrCreateUserByClerkId,
  getUserByUsername,
  getUserProfileStats,
  interviewReports,
  listReportsForUser,
  type ReportWriteInput,
  roles,
  topics,
  userVerifications,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("user profile reads", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let aliceId: string; // has a username + display name; the profile under test
  let bobId: string; // a second author so cross-author rows don't leak in
  let companyAId: string;
  let companyBId: string;
  let sweId: string;
  let topicId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });

    aliceId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_prof_alice" })).id;
    bobId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_prof_bob" })).id;
    await db
      .update(users)
      .set({ username: "alice_loops", displayName: "Alice L." })
      .where(eq(users.id, aliceId));
    await db
      .update(users)
      .set({ username: "bob_codes", displayName: "Bob C." })
      .where(eq(users.id, bobId));

    companyAId = (
      await db
        .insert(companies)
        .values({ slug: "profco-a", name: "ProfCo A", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    companyBId = (
      await db
        .insert(companies)
        .values({ slug: "profco-b", name: "ProfCo B", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    sweId = (
      await db
        .insert(roles)
        .values({ slug: "prof-swe", name: "Prof SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "prof-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    await db.delete(userVerifications).where(inArray(userVerifications.userId, [aliceId, bobId]));
    await db.delete(interviewReports).where(inArray(interviewReports.companyId, [companyAId, companyBId]));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(roles).where(eq(roles.id, sweId));
    await db.delete(companies).where(inArray(companies.id, [companyAId, companyBId]));
    await db.delete(users).where(inArray(users.id, [aliceId, bobId]));
    await close();
  });

  beforeEach(async () => {
    await db.delete(interviewReports).where(inArray(interviewReports.companyId, [companyAId, companyBId]));
    await db.delete(userVerifications).where(inArray(userVerifications.userId, [aliceId, bobId]));
  });

  async function makeReport(overrides: Partial<ReportWriteInput> = {}): Promise<string> {
    const input: ReportWriteInput = {
      createdByUserId: aliceId,
      companyId: companyAId,
      canonicalRoleId: sweId,
      level: "L4",
      levelId: null,
      interviewMonth: "2026-02",
      outcome: "offer",
      displayAttribution: "display_name",
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

  it("getUserByUsername returns the row; null for an unknown handle", async () => {
    const found = await getUserByUsername(db, "alice_loops");
    expect(found?.id).toBe(aliceId);
    expect(found?.displayName).toBe("Alice L.");
    expect(await getUserByUsername(db, "nobody_here")).toBeNull();
  });

  it("lists only the user's ATTRIBUTED, visible reports — newest first", async () => {
    await makeReport({ interviewMonth: "2026-01" });
    await makeReport({ companyId: companyBId, interviewMonth: "2026-03" });
    await makeReport({ displayAttribution: "anonymous" }); // hidden: anonymous
    await makeReport({ status: "pending_moderation" }); // hidden: not active
    await makeReport({ createdByUserId: bobId }); // hidden: another author

    const page = await listReportsForUser(db, aliceId, { limit: 10, offset: 0 });

    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    // Newest first: the companyB report (2026-03) leads. Company rides per-row.
    expect(page.items[0]?.companySlug).toBe("profco-b");
    expect(page.items[0]?.companyName).toBe("ProfCo B");
    expect(page.items[1]?.companySlug).toBe("profco-a");
    // Attributed rows carry the author's display name.
    expect(page.items[0]?.authorName).toBe("Alice L.");
  });

  it("excludes soft-deleted reports", async () => {
    const id = await makeReport();
    await db
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(interviewReports.id, id));

    const page = await listReportsForUser(db, aliceId, { limit: 10, offset: 0 });
    expect(page.total).toBe(0);
  });

  it("getUserProfileStats counts attributed visible reports + distinct verified companies", async () => {
    await makeReport();
    await makeReport({ companyId: companyBId });
    await makeReport({ displayAttribution: "anonymous" }); // not counted
    await makeReport({ status: "pending_moderation" }); // not counted

    // Two verifications at the SAME company collapse to one distinct company.
    await db.insert(userVerifications).values([
      {
        userId: aliceId,
        companyId: companyAId,
        verifiedVia: "work_email",
        evidenceTokenHash: "hash-a",
      },
      {
        userId: aliceId,
        companyId: companyAId,
        verifiedVia: "linkedin",
        evidenceTokenHash: "hash-b",
      },
      {
        userId: aliceId,
        companyId: companyBId,
        verifiedVia: "work_email",
        evidenceTokenHash: "hash-c",
      },
    ]);

    const stats = await getUserProfileStats(db, aliceId);
    expect(stats.publicReportCount).toBe(2);
    expect(stats.verifiedAtCompanyCount).toBe(2);
  });

  it("stats are zero for a user with no public footprint", async () => {
    await makeReport({ displayAttribution: "anonymous" });
    const stats = await getUserProfileStats(db, aliceId);
    expect(stats.publicReportCount).toBe(0);
    expect(stats.verifiedAtCompanyCount).toBe(0);
  });
});
