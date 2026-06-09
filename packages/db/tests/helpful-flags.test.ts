// Helpful-flags (Sprint 5 Day 8): the toggle + its three guards (no self-flag,
// verified-only, 50/day rate limit) and the author's +1-per-flag karma earn —
// including the recompute's live re-checks (a flag from an unverified or self
// flagger never earns). Taxonomy is isolated by this suite's slugs; reports +
// flags + verifications are cleared in beforeEach.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  companies,
  countHelpfulFlags,
  createReport,
  flagReportHelpful,
  getOrCreateUserByClerkId,
  getUserById,
  hasUserFlaggedReport,
  HELPFUL_FLAG_DAILY_LIMIT,
  helpfulFlags,
  interviewReports,
  KARMA_EARN,
  recomputeUserKarma,
  type ReportWriteInput,
  roles,
  topics,
  unflagReportHelpful,
  userVerifications,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("helpful flags", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let aliceId: string; // author of the report being flagged
  let bobId: string; // a VERIFIED flagger
  let carolId: string; // an UNVERIFIED flagger
  let companyId: string;
  let roleId: string;
  let topicId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });

    aliceId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_hf_alice" })).id;
    bobId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_hf_bob" })).id;
    carolId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_hf_carol" })).id;

    companyId = (
      await db
        .insert(companies)
        .values({ slug: "hfco", name: "HFCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "hf-swe", name: "HF SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "hf-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    // Reports cascade-delete their flags; clear verifications + reset rows.
    await db.delete(interviewReports).where(eq(interviewReports.companyId, companyId));
    await db.delete(userVerifications).where(inArray(userVerifications.userId, [aliceId, bobId, carolId]));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(users).where(inArray(users.id, [aliceId, bobId, carolId]));
    await close();
  });

  beforeEach(async () => {
    await db.delete(interviewReports).where(eq(interviewReports.companyId, companyId));
    await db.delete(userVerifications).where(inArray(userVerifications.userId, [aliceId, bobId, carolId]));
    await db.update(users).set({ karma: 0 }).where(inArray(users.id, [aliceId, bobId, carolId]));
    // Bob is verified-pro; Carol is not.
    await db.insert(userVerifications).values({
      userId: bobId,
      companyId,
      verifiedVia: "work_email",
      evidenceTokenHash: "hash-bob",
    });
  });

  // A full report via the normal write path (emits its create event).
  async function makeReport(authorId = aliceId): Promise<string> {
    const input: ReportWriteInput = {
      createdByUserId: authorId,
      companyId,
      canonicalRoleId: roleId,
      level: "L4",
      levelId: null,
      interviewMonth: "2026-02",
      outcome: "offer",
      displayAttribution: "anonymous",
      status: "active",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: "Loop.",
          questions: [{ prose: "q", topicIds: [topicId] }],
        },
      ],
    };
    return (await createReport(db, input)).id;
  }

  // A bare report row (no rounds/events) — cheap filler for the rate-limit test.
  async function bareReport(authorId = aliceId): Promise<string> {
    return (
      await db
        .insert(interviewReports)
        .values({
          createdByUserId: authorId,
          companyId,
          canonicalRoleId: roleId,
          level: "L4",
          interviewMonth: "2026-02",
          status: "active",
        })
        .returning({ id: interviewReports.id })
    )[0]!.id;
  }

  it("a verified reader flags a report: count +1, author earns +1 karma", async () => {
    const reportId = await makeReport();
    await recomputeUserKarma(db, aliceId); // base only: 5

    const res = await flagReportHelpful(db, { reportId, flaggerUserId: bobId });
    expect(res).toEqual({ ok: true, flagged: true, count: 1 });
    expect(await hasUserFlaggedReport(db, reportId, bobId)).toBe(true);
    expect(await countHelpfulFlags(db, reportId)).toBe(1);
    // Author karma recomputed inline: base 5 + 1 flag.
    expect((await getUserById(db, aliceId))?.karma).toBe(
      KARMA_EARN.unverified + KARMA_EARN.helpfulFlag,
    );
  });

  it("refuses a self-flag", async () => {
    const reportId = await makeReport();
    const res = await flagReportHelpful(db, { reportId, flaggerUserId: aliceId });
    expect(res).toEqual({ ok: false, reason: "self_flag" });
    expect(await countHelpfulFlags(db, reportId)).toBe(0);
  });

  it("refuses an unverified flagger", async () => {
    const reportId = await makeReport();
    const res = await flagReportHelpful(db, { reportId, flaggerUserId: carolId });
    expect(res).toEqual({ ok: false, reason: "not_verified" });
  });

  it("refuses a missing or deleted report", async () => {
    expect(
      await flagReportHelpful(db, {
        reportId: "00000000-0000-0000-0000-000000000000",
        flaggerUserId: bobId,
      }),
    ).toEqual({ ok: false, reason: "not_found" });

    const reportId = await makeReport();
    await db
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(interviewReports.id, reportId));
    expect(
      await flagReportHelpful(db, { reportId, flaggerUserId: bobId }),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("is idempotent — re-flagging is a benign no-op, no double count", async () => {
    const reportId = await makeReport();
    await flagReportHelpful(db, { reportId, flaggerUserId: bobId });
    const again = await flagReportHelpful(db, { reportId, flaggerUserId: bobId });
    expect(again).toEqual({ ok: true, flagged: true, count: 1 });
    expect(await countHelpfulFlags(db, reportId)).toBe(1);
  });

  it("un-flag removes the row and withdraws the author's +1", async () => {
    const reportId = await makeReport();
    await flagReportHelpful(db, { reportId, flaggerUserId: bobId });
    expect((await getUserById(db, aliceId))?.karma).toBe(
      KARMA_EARN.unverified + KARMA_EARN.helpfulFlag,
    );

    const res = await unflagReportHelpful(db, { reportId, flaggerUserId: bobId });
    expect(res).toEqual({ ok: true, flagged: false, count: 0 });
    expect(await hasUserFlaggedReport(db, reportId, bobId)).toBe(false);
    expect((await getUserById(db, aliceId))?.karma).toBe(KARMA_EARN.unverified);
  });

  it("enforces the daily rate limit", async () => {
    // Pre-load Bob with exactly the cap of standing flags across filler reports.
    const fillerReports = await Promise.all(
      Array.from({ length: HELPFUL_FLAG_DAILY_LIMIT }, () => bareReport()),
    );
    await db
      .insert(helpfulFlags)
      .values(fillerReports.map((reportId) => ({ reportId, flaggerUserId: bobId })));

    // The next flag (on a fresh report) is refused.
    const fresh = await makeReport();
    expect(
      await flagReportHelpful(db, { reportId: fresh, flaggerUserId: bobId }),
    ).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("recompute earns ONLY from verified, non-self flaggers (live re-check)", async () => {
    const reportId = await makeReport();
    // Insert flags directly, bypassing the write-path guards: one from the
    // unverified Carol, one from the author herself. Neither should earn.
    await db.insert(helpfulFlags).values([
      { reportId, flaggerUserId: carolId },
      { reportId, flaggerUserId: aliceId },
    ]);
    const res = await recomputeUserKarma(db, aliceId);
    expect(res.karma).toBe(KARMA_EARN.unverified); // base only, no flag earn

    // Verify Carol → her existing flag now counts on the next recompute.
    await db.insert(userVerifications).values({
      userId: carolId,
      companyId,
      verifiedVia: "linkedin",
      evidenceTokenHash: "hash-carol",
    });
    const res2 = await recomputeUserKarma(db, aliceId);
    expect(res2.karma).toBe(KARMA_EARN.unverified + KARMA_EARN.helpfulFlag);
  });
});
