// Karma comment-like earn term (ADR-0011): the double cap (per-comment-per-day
// and per-day-total), its summation across days, and the exclusions (self-likes,
// non-active comments). Likes are inserted directly with controlled created_at
// so the per-day bucketing is deterministic; the commenter (alice) authors NO
// reports, so her karma is the pure comment-like earn with no submission base.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  COMMENT_LIKE_KARMA_DAILY_CAP,
  COMMENT_LIKE_KARMA_PER_COMMENT_DAILY_CAP,
  companies,
  commentLikes,
  comments,
  createComment,
  createReport,
  getOrCreateUserByClerkId,
  getUserById,
  interviewReports,
  KARMA_EARN,
  recomputeUserKarma,
  type ReportWriteInput,
  roles,
  topics,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

const DAY1 = new Date("2026-03-01T12:00:00Z");
const DAY2 = new Date("2026-03-02T12:00:00Z");
const LIKER_COUNT = 12;

describe("karma — comment-like earn", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let aliceId: string; // commenter under test — authors NO reports
  let bobId: string; // report author (so there's an active report to comment on)
  let likerIds: string[]; // a pool of distinct likers
  let companyId: string;
  let roleId: string;
  let topicId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });

    aliceId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_cl_alice" })).id;
    bobId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_cl_bob" })).id;
    likerIds = [];
    for (let i = 0; i < LIKER_COUNT; i++) {
      likerIds.push(
        (await getOrCreateUserByClerkId(db, { clerkId: `clerk_cl_liker_${i}` })).id,
      );
    }

    companyId = (
      await db
        .insert(companies)
        .values({ slug: "clco", name: "ClCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "cl-swe", name: "Cl SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "cl-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    await db.delete(interviewReports).where(eq(interviewReports.companyId, companyId));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(users).where(inArray(users.id, [aliceId, bobId, ...likerIds]));
    await close();
  });

  beforeEach(async () => {
    await db.delete(interviewReports).where(eq(interviewReports.companyId, companyId));
    await db.update(users).set({ karma: 0 }).where(inArray(users.id, [aliceId, bobId]));
  });

  // Bob's active report; alice comments on it. Returns the comment id.
  async function aliceComment(): Promise<string> {
    const input: ReportWriteInput = {
      createdByUserId: bobId,
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
    const { id: reportId } = await createReport(db, input);
    const res = await createComment(db, { reportId, authorUserId: aliceId, body: "an answer" });
    if (!res.ok) throw new Error(`aliceComment: ${res.reason}`);
    return res.comment.id;
  }

  // Insert N distinct likers on a comment at a given day (bypasses the toggle's
  // guards so we can control created_at + volume precisely).
  async function seedLikes(commentId: string, n: number, day: Date): Promise<void> {
    await db.insert(commentLikes).values(
      likerIds.slice(0, n).map((userId) => ({ commentId, userId, createdAt: day })),
    );
  }

  it("caps a single comment's likes per day at the per-comment cap", async () => {
    const commentId = await aliceComment();
    await seedLikes(commentId, COMMENT_LIKE_KARMA_PER_COMMENT_DAILY_CAP + 3, DAY1);
    const { karma } = await recomputeUserKarma(db, aliceId);
    expect(karma).toBe(COMMENT_LIKE_KARMA_PER_COMMENT_DAILY_CAP * KARMA_EARN.commentLike);
  });

  it("caps the per-day total across multiple comments at the daily cap", async () => {
    // 3 comments, each maxed for the day. Per-comment sum would exceed the daily
    // total, so the day is clamped to COMMENT_LIKE_KARMA_DAILY_CAP.
    const per = COMMENT_LIKE_KARMA_PER_COMMENT_DAILY_CAP;
    for (let i = 0; i < 3; i++) {
      const c = await aliceComment();
      await seedLikes(c, per, DAY1);
    }
    const { karma } = await recomputeUserKarma(db, aliceId);
    expect(3 * per).toBeGreaterThan(COMMENT_LIKE_KARMA_DAILY_CAP); // precondition
    expect(karma).toBe(COMMENT_LIKE_KARMA_DAILY_CAP);
  });

  it("sums capped days — the daily cap is per-day, not lifetime", async () => {
    // Two comments, each maxed on BOTH days with disjoint liker sets. Each day
    // clamps to the daily cap; the two days sum.
    const per = COMMENT_LIKE_KARMA_PER_COMMENT_DAILY_CAP;
    const c1 = await aliceComment();
    const c2 = await aliceComment();
    // day1: likers 0..(per-1); day2: likers per..(2*per-1) — disjoint, so the
    // unique (comment,user) index never collides.
    const day1 = likerIds.slice(0, per);
    const day2 = likerIds.slice(per, 2 * per);
    for (const c of [c1, c2]) {
      await db.insert(commentLikes).values([
        ...day1.map((userId) => ({ commentId: c, userId, createdAt: DAY1 })),
        ...day2.map((userId) => ({ commentId: c, userId, createdAt: DAY2 })),
      ]);
    }
    const { karma } = await recomputeUserKarma(db, aliceId);
    expect(karma).toBe(2 * COMMENT_LIKE_KARMA_DAILY_CAP);
  });

  it("excludes self-likes and likes on non-active comments", async () => {
    const commentId = await aliceComment();
    // 3 legit likers + 1 self-like row (direct insert bypasses the guard).
    await seedLikes(commentId, 3, DAY1);
    await db.insert(commentLikes).values({ commentId, userId: aliceId, createdAt: DAY1 });
    expect((await recomputeUserKarma(db, aliceId)).karma).toBe(3 * KARMA_EARN.commentLike);

    // Hiding the comment drops its earn entirely.
    await db.update(comments).set({ status: "hidden" }).where(eq(comments.id, commentId));
    expect((await recomputeUserKarma(db, aliceId)).karma).toBe(0);
  });

  it("a report author still earns the submission base on top of comment-likes", async () => {
    // Sanity: alice authors her OWN report here, then also gets a comment liked.
    const input: ReportWriteInput = {
      createdByUserId: aliceId,
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
    const { id: reportId } = await createReport(db, input);
    const res = await createComment(db, { reportId, authorUserId: aliceId, body: "self-comment ok" });
    if (!res.ok) throw new Error("setup");
    await seedLikes(res.comment.id, 2, DAY1);

    const { karma } = await recomputeUserKarma(db, aliceId);
    expect(karma).toBe(KARMA_EARN.unverified + 2 * KARMA_EARN.commentLike);
  });
});
