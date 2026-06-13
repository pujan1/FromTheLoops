// Likes (ADR-0011): the casual post/comment toggles — idempotent, self-like
// blocked, un-like withdraws — plus the batched count/viewer-state reads. The
// comment-like → commenter-karma coupling is asserted here at the toggle level
// (the capped earn maths lives in karma-comment-like.test.ts). Taxonomy is
// isolated by this suite's slugs; reports cascade their comments + likes.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  commentsLikedByUser,
  companies,
  countCommentLikes,
  countCommentLikesForComments,
  countPostLikes,
  countPostLikesForReports,
  createComment,
  createReport,
  getOrCreateUserByClerkId,
  getUserById,
  hasUserLikedComment,
  hasUserLikedPost,
  interviewReports,
  KARMA_EARN,
  likeComment,
  likePost,
  recomputeUserKarma,
  type ReportWriteInput,
  roles,
  topics,
  unlikeComment,
  unlikePost,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("likes", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let aliceId: string; // report + comment author
  let bobId: string; // a liker
  let companyId: string;
  let roleId: string;
  let topicId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });

    aliceId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_lk_alice" })).id;
    bobId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_lk_bob" })).id;

    companyId = (
      await db
        .insert(companies)
        .values({ slug: "lkco", name: "LkCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "lk-swe", name: "Lk SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "lk-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    await db.delete(interviewReports).where(eq(interviewReports.companyId, companyId));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(users).where(inArray(users.id, [aliceId, bobId]));
    await close();
  });

  beforeEach(async () => {
    await db.delete(interviewReports).where(eq(interviewReports.companyId, companyId));
    await db.update(users).set({ karma: 0 }).where(inArray(users.id, [aliceId, bobId]));
  });

  async function makeReport(): Promise<string> {
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
    return (await createReport(db, input)).id;
  }

  async function makeComment(reportId: string, authorUserId = aliceId): Promise<string> {
    const res = await createComment(db, { reportId, authorUserId, body: "a comment" });
    if (!res.ok) throw new Error(`makeComment: ${res.reason}`);
    return res.comment.id;
  }

  it("post like toggles and is idempotent; un-like withdraws", async () => {
    const reportId = await makeReport();
    expect(await likePost(db, { reportId, userId: bobId })).toEqual({
      ok: true,
      liked: true,
      count: 1,
    });
    // Re-like is a benign no-op (no double count).
    expect(await likePost(db, { reportId, userId: bobId })).toEqual({
      ok: true,
      liked: true,
      count: 1,
    });
    expect(await hasUserLikedPost(db, reportId, bobId)).toBe(true);

    expect(await unlikePost(db, { reportId, userId: bobId })).toEqual({
      ok: true,
      liked: false,
      count: 0,
    });
    expect(await hasUserLikedPost(db, reportId, bobId)).toBe(false);
  });

  it("blocks a self-like on a post and on a comment", async () => {
    const reportId = await makeReport();
    expect(await likePost(db, { reportId, userId: aliceId })).toEqual({
      ok: false,
      reason: "self_like",
    });
    const commentId = await makeComment(reportId, aliceId);
    expect(await likeComment(db, { commentId, userId: aliceId })).toEqual({
      ok: false,
      reason: "self_like",
    });
  });

  it("post likes earn no karma; a comment like earns the commenter karma", async () => {
    const reportId = await makeReport();
    // Establish the baseline: createReport doesn't recompute inline (the worker
    // does), so recompute once to bake in the report's submission base.
    await recomputeUserKarma(db, aliceId);
    const base = (await getUserById(db, aliceId))!.karma;

    // A post like must not move karma.
    await likePost(db, { reportId, userId: bobId });
    expect((await getUserById(db, aliceId))!.karma).toBe(base);

    // A comment like recomputes the comment author's (Alice's) karma: +1.
    const commentId = await makeComment(reportId, aliceId);
    await likeComment(db, { commentId, userId: bobId });
    expect((await getUserById(db, aliceId))!.karma).toBe(base + KARMA_EARN.commentLike);

    // Un-liking withdraws it.
    await unlikeComment(db, { commentId, userId: bobId });
    expect((await getUserById(db, aliceId))!.karma).toBe(base);
  });

  it("counts comment likes and reports a viewer's like state", async () => {
    const reportId = await makeReport();
    const commentId = await makeComment(reportId, aliceId);
    await likeComment(db, { commentId, userId: bobId });
    expect(await countCommentLikes(db, commentId)).toBe(1);
    expect(await hasUserLikedComment(db, commentId, bobId)).toBe(true);
  });

  it("batches post-like counts, comment-like counts, and per-viewer liked set", async () => {
    const a = await makeReport();
    const b = await makeReport();
    await likePost(db, { reportId: a, userId: bobId });

    const c1 = await makeComment(a, aliceId);
    const c2 = await makeComment(a, aliceId);
    await likeComment(db, { commentId: c1, userId: bobId });

    const postCounts = await countPostLikesForReports(db, [a, b]);
    expect(postCounts.get(a)).toBe(1);
    expect(postCounts.has(b)).toBe(false); // zero → absent

    const commentCounts = await countCommentLikesForComments(db, [c1, c2]);
    expect(commentCounts.get(c1)).toBe(1);
    expect(commentCounts.has(c2)).toBe(false);

    const liked = await commentsLikedByUser(db, [c1, c2], bobId);
    expect(liked.has(c1)).toBe(true);
    expect(liked.has(c2)).toBe(false);

    // Empty inputs short-circuit.
    expect((await countPostLikesForReports(db, [])).size).toBe(0);
    expect((await commentsLikedByUser(db, [], bobId)).size).toBe(0);
  });
});
