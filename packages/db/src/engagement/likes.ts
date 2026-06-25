// Likes data-access (ADR-0011).
//
// A like is a casual TOGGLE (insert to like, delete to un-like), one per
// (target, user), on either a report (post_likes) or a comment (comment_likes).
// Deliberately lighter than helpful-flags: ANY signed-in user can like, there is
// no verification gate, and the vanity COUNT earns nobody karma. The ONE place a
// like touches karma is a like on a *comment*, which recomputes the comment
// author's karma (the capped earn term lives in karma.ts) — mirroring how a
// helpful-flag recomputes the report author's.
//
// One guard: no self-like (you can't like your own report/comment), re-checked
// here server-side even though the UI hides the control. Like helpful-flags,
// the unique index makes a double-like a no-op (onConflictDoNothing).

import { and, eq, inArray, sql } from "drizzle-orm";
import { recomputeUserKarma } from "../users/karma.js";
import {
  comments,
  commentLikes,
  interviewReports,
  postLikes,
} from "../schema/index.js";
import type { Db } from "../lib/types.js";

export type LikeRefusal = "self_like" | "not_found";

export type LikeResult =
  | { ok: true; liked: boolean; count: number }
  | { ok: false; reason: LikeRefusal };

// ── Post likes ─────────────────────────────────────────────────────────────

export async function countPostLikes(db: Db, reportId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM post_likes WHERE report_id = ${reportId}::uuid`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function hasUserLikedPost(
  db: Db,
  reportId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: postLikes.id })
    .from(postLikes)
    .where(and(eq(postLikes.reportId, reportId), eq(postLikes.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// Like a report. Idempotent (already-liked → benign success). Blocks self-like
// and a like on a missing/deleted report. No karma (post likes are vanity-only).
export async function likePost(
  db: Db,
  input: { reportId: string; userId: string },
): Promise<LikeResult> {
  const { reportId, userId } = input;
  const rows = await db
    .select({
      authorId: interviewReports.createdByUserId,
      status: interviewReports.status,
    })
    .from(interviewReports)
    .where(eq(interviewReports.id, reportId))
    .limit(1);
  const report = rows[0];
  if (!report || report.status === "deleted") {
    return { ok: false, reason: "not_found" };
  }
  if (report.authorId === userId) {
    return { ok: false, reason: "self_like" };
  }

  await db
    .insert(postLikes)
    .values({ reportId, userId })
    .onConflictDoNothing();

  return { ok: true, liked: true, count: await countPostLikes(db, reportId) };
}

// Remove the viewer's like. Always allowed; no-op if absent.
export async function unlikePost(
  db: Db,
  input: { reportId: string; userId: string },
): Promise<{ ok: true; liked: false; count: number }> {
  const { reportId, userId } = input;
  await db
    .delete(postLikes)
    .where(and(eq(postLikes.reportId, reportId), eq(postLikes.userId, userId)));
  return { ok: true, liked: false, count: await countPostLikes(db, reportId) };
}

// ── Comment likes ────────────────────────────────────────────────────────────

export async function countCommentLikes(
  db: Db,
  commentId: string,
): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM comment_likes WHERE comment_id = ${commentId}::uuid`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function hasUserLikedComment(
  db: Db,
  commentId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: commentLikes.id })
    .from(commentLikes)
    .where(
      and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)),
    )
    .limit(1);
  return rows.length > 0;
}

// Like a comment. Idempotent; blocks self-like and likes on a non-active
// comment. Recomputes the COMMENT AUTHOR's karma so the (capped) earn lands.
export async function likeComment(
  db: Db,
  input: { commentId: string; userId: string },
): Promise<LikeResult> {
  const { commentId, userId } = input;
  const rows = await db
    .select({ authorId: comments.authorUserId, status: comments.status })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  const comment = rows[0];
  if (!comment || comment.status !== "active") {
    return { ok: false, reason: "not_found" };
  }
  if (comment.authorId === userId) {
    return { ok: false, reason: "self_like" };
  }

  await db
    .insert(commentLikes)
    .values({ commentId, userId })
    .onConflictDoNothing();

  await recomputeUserKarma(db, comment.authorId);

  return { ok: true, liked: true, count: await countCommentLikes(db, commentId) };
}

// Remove the viewer's like on a comment. Always allowed; no-op if absent.
// Recomputes the author's karma so the withdrawal lands immediately.
export async function unlikeComment(
  db: Db,
  input: { commentId: string; userId: string },
): Promise<{ ok: true; liked: false; count: number }> {
  const { commentId, userId } = input;
  const authorRows = await db
    .select({ authorId: comments.authorUserId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  await db
    .delete(commentLikes)
    .where(
      and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)),
    );

  const authorId = authorRows[0]?.authorId;
  if (authorId) await recomputeUserKarma(db, authorId);

  return { ok: true, liked: false, count: await countCommentLikes(db, commentId) };
}

// ── Batched counts for list/card surfaces (ADR-0011) ─────────────────────────
//
// The "counts on cards via one batched GROUP BY" read. Returns a Map keyed by
// id; ids with zero likes are absent (callers default to 0). Empty input →
// empty map (avoids an `IN ()` query).

export async function countPostLikesForReports(
  db: Db,
  reportIds: string[],
): Promise<Map<string, number>> {
  if (reportIds.length === 0) return new Map();
  const rows = await db
    .select({
      reportId: postLikes.reportId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(postLikes)
    .where(inArray(postLikes.reportId, reportIds))
    .groupBy(postLikes.reportId);
  return new Map(rows.map((r) => [r.reportId, Number(r.count)]));
}

export async function countCommentLikesForComments(
  db: Db,
  commentIds: string[],
): Promise<Map<string, number>> {
  if (commentIds.length === 0) return new Map();
  const rows = await db
    .select({
      commentId: commentLikes.commentId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(commentLikes)
    .where(inArray(commentLikes.commentId, commentIds))
    .groupBy(commentLikes.commentId);
  return new Map(rows.map((r) => [r.commentId, Number(r.count)]));
}

// Which of these comments has the viewer liked? Drives the per-comment toggle
// state across a whole rendered page in one query. Empty input → empty set.
export async function commentsLikedByUser(
  db: Db,
  commentIds: string[],
  userId: string,
): Promise<Set<string>> {
  if (commentIds.length === 0) return new Set();
  const rows = await db
    .select({ commentId: commentLikes.commentId })
    .from(commentLikes)
    .where(
      and(
        inArray(commentLikes.commentId, commentIds),
        eq(commentLikes.userId, userId),
      ),
    );
  return new Set(rows.map((r) => r.commentId));
}
