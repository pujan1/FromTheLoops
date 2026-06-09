// Karma recompute (Sprint 5, Day 7): the earn rule (5 unverified / 10
// verified-pro per non-deleted report) and the recompute-from-scratch behavior
// the worker relies on — idempotent, deleted reports withdraw their karma, and
// a report's tier reads live from user_verifications. Plus getReportAuthorId,
// the event→author hop the karma consumer makes. Taxonomy is isolated by this
// suite's own slugs; reports + verifications are cleared in beforeEach so each
// recompute reads deterministically.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  companies,
  createReport,
  getOrCreateUserByClerkId,
  getReportAuthorId,
  getUserById,
  interviewReports,
  KARMA_EARN,
  recomputeUserKarma,
  type ReportWriteInput,
  roles,
  topics,
  userVerifications,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("karma recompute", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let aliceId: string; // the user under test
  let bobId: string; // a second author whose reports must not leak in
  let companyAId: string;
  let companyBId: string;
  let sweId: string;
  let topicId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });

    aliceId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_karma_alice" })).id;
    bobId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_karma_bob" })).id;

    companyAId = (
      await db
        .insert(companies)
        .values({ slug: "karmaco-a", name: "KarmaCo A", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    companyBId = (
      await db
        .insert(companies)
        .values({ slug: "karmaco-b", name: "KarmaCo B", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    sweId = (
      await db
        .insert(roles)
        .values({ slug: "karma-swe", name: "Karma SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "karma-arrays", name: "Arrays", status: "active" })
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
    await db.update(users).set({ karma: 0 }).where(inArray(users.id, [aliceId, bobId]));
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
      displayAttribution: "anonymous", // attribution is irrelevant to karma
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

  async function verifyAt(companyId: string): Promise<void> {
    await db.insert(userVerifications).values({
      userId: aliceId,
      companyId,
      verifiedVia: "work_email",
      evidenceTokenHash: `hash-${companyId}`,
    });
  }

  it("awards the unverified base (5) per non-deleted report", async () => {
    await makeReport();
    await makeReport({ companyId: companyBId });

    const res = await recomputeUserKarma(db, aliceId);
    expect(res.found).toBe(true);
    expect(res.karma).toBe(2 * KARMA_EARN.unverified);
    expect(res.previous).toBe(0);
    expect(res.changed).toBe(true);
    // Persisted on the row.
    expect((await getUserById(db, aliceId))?.karma).toBe(2 * KARMA_EARN.unverified);
  });

  it("awards the verified-pro base (10) for reports at a company the author is verified at", async () => {
    await verifyAt(companyAId); // verified at A only
    await makeReport(); // company A -> 10
    await makeReport({ companyId: companyBId }); // company B -> 5

    const res = await recomputeUserKarma(db, aliceId);
    expect(res.karma).toBe(KARMA_EARN.verifiedPro + KARMA_EARN.unverified);
  });

  it("counts pending_moderation reports but never deleted ones", async () => {
    await makeReport({ status: "pending_moderation" }); // counts: 5
    const deleted = await makeReport();
    await db
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(interviewReports.id, deleted));

    const res = await recomputeUserKarma(db, aliceId);
    expect(res.karma).toBe(KARMA_EARN.unverified);
  });

  it("ignores reports authored by other users", async () => {
    await makeReport(); // alice: 5
    await makeReport({ createdByUserId: bobId }); // bob's, not alice's

    const res = await recomputeUserKarma(db, aliceId);
    expect(res.karma).toBe(KARMA_EARN.unverified);
  });

  it("is idempotent: a second recompute lands the same value and reports changed=false", async () => {
    await makeReport();
    const first = await recomputeUserKarma(db, aliceId);
    const second = await recomputeUserKarma(db, aliceId);
    expect(second.karma).toBe(first.karma);
    expect(second.previous).toBe(first.karma);
    expect(second.changed).toBe(false);
  });

  it("recomputes downward when a report is deleted (karma is withdrawn)", async () => {
    const id = await makeReport();
    await makeReport({ companyId: companyBId });
    await recomputeUserKarma(db, aliceId); // 10

    await db
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(interviewReports.id, id));

    const res = await recomputeUserKarma(db, aliceId);
    expect(res.previous).toBe(2 * KARMA_EARN.unverified);
    expect(res.karma).toBe(KARMA_EARN.unverified);
    expect(res.changed).toBe(true);
  });

  it("a user with no reports recomputes to 0", async () => {
    const res = await recomputeUserKarma(db, aliceId);
    expect(res).toMatchObject({ karma: 0, found: true, changed: false });
  });

  it("an unknown user id is a benign no-op (found=false)", async () => {
    const res = await recomputeUserKarma(db, "00000000-0000-0000-0000-000000000000");
    expect(res).toEqual({ karma: 0, previous: 0, changed: false, found: false });
  });

  it("getReportAuthorId resolves the author; null for an unknown report", async () => {
    const id = await makeReport();
    expect(await getReportAuthorId(db, id)).toBe(aliceId);
    expect(
      await getReportAuthorId(db, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});
