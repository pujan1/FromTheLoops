// Comment writes (guards: length, rate limit, active-report-only, quote/reply
// integrity) + anonymity-safe reads. Anonymity is enforced here: reads never
// return an anonymous comment's author_user_id, only a derived authorLabel +
// server-computed viewerIsAuthor.

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { comments, users } from "../schema/index.js";
import type { Db } from "../lib/types.js";
import { DAY_MS } from "../lib/time.js";
import type { Comment } from "../schema/comments.js";

// Body bounds + rolling-24h per-author post cap.
export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_RATE_LIMIT = 100;
export const COMMENT_WINDOW_MS = DAY_MS;
const REPLY_PREVIEW_CHARS = 120;

export type CommentRefusal =
  | "empty"
  | "too_long"
  | "report_not_available"
  | "rate_limited"
  | "invalid_quote"
  | "invalid_reply";

export type CreateCommentResult =
  | { ok: true; comment: Comment }
  | { ok: false; reason: CommentRefusal };

export type CommentSort = "newest" | "top";

// Anonymity-safe shape for the web layer. No raw author_user_id.
export interface CommentView {
  id: string;
  body: string | null; // null when PII-purged or non-active
  status: "active" | "hidden" | "deleted";
  authorLabel: string | null; // null when anonymous
  viewerIsAuthor: boolean;
  createdAt: Date;
  editedAt: Date | null;
  likeCount: number;
  viewerLiked: boolean;
  quotedQuestionId: string | null;
  quotedText: string | null;
  replyToCommentId: string | null;
  replyTo: {
    authorLabel: string | null;
    snippet: string | null;
    status: "active" | "hidden" | "deleted";
  } | null;
}

export async function createComment(
  db: Db,
  input: {
    reportId: string;
    authorUserId: string;
    body: string;
    displayAttribution?: "display_name" | "anonymous";
    quotedQuestionId?: string | null;
    replyToCommentId?: string | null;
  },
): Promise<CreateCommentResult> {
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, reason: "empty" };
  if (body.length > COMMENT_MAX_LENGTH) return { ok: false, reason: "too_long" };

  // Active (public) report only.
  const reportRows = await db.execute<{ status: string }>(
    sql`SELECT status FROM interview_reports WHERE id = ${input.reportId}::uuid LIMIT 1`,
  );
  if (reportRows[0]?.status !== "active") {
    return { ok: false, reason: "report_not_available" };
  }

  if (await reachedRateLimit(db, input.authorUserId)) {
    return { ok: false, reason: "rate_limited" };
  }

  // Quoted question must belong to this report; snapshot its prose.
  let quotedText: string | null = null;
  if (input.quotedQuestionId) {
    const qRows = await db.execute<{ question_prose: string }>(sql`
      SELECT q.question_prose
        FROM questions q
        JOIN rounds rd ON rd.id = q.round_id
       WHERE q.id = ${input.quotedQuestionId}::uuid
         AND rd.report_id = ${input.reportId}::uuid
       LIMIT 1
    `);
    if (!qRows[0]) return { ok: false, reason: "invalid_quote" };
    quotedText = qRows[0].question_prose;
  }

  // Reply target must be an active comment on this report.
  if (input.replyToCommentId) {
    const pRows = await db.execute<{ id: string }>(sql`
      SELECT id FROM comments
       WHERE id = ${input.replyToCommentId}::uuid
         AND report_id = ${input.reportId}::uuid
         AND status = 'active'
       LIMIT 1
    `);
    if (!pRows[0]) return { ok: false, reason: "invalid_reply" };
  }

  let displayAttribution = input.displayAttribution;
  if (!displayAttribution) {
    const u = await db
      .select({ d: users.defaultDisplayAttribution })
      .from(users)
      .where(eq(users.id, input.authorUserId))
      .limit(1);
    displayAttribution = u[0]?.d ?? "anonymous";
  }

  const inserted = await db
    .insert(comments)
    .values({
      reportId: input.reportId,
      authorUserId: input.authorUserId,
      body,
      displayAttribution,
      quotedQuestionId: input.quotedQuestionId ?? null,
      quotedText,
      replyToCommentId: input.replyToCommentId ?? null,
    })
    .returning();

  const comment = inserted[0];
  if (!comment) throw new Error("createComment: insert returned no row");
  return { ok: true, comment };
}

// Scoped to (id, author, active) so a non-owner / deleted row updates nothing.
export async function editComment(
  db: Db,
  input: { commentId: string; authorUserId: string; body: string },
): Promise<{ ok: true; comment: Comment } | { ok: false; reason: CommentRefusal | "not_found" }> {
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, reason: "empty" };
  if (body.length > COMMENT_MAX_LENGTH) return { ok: false, reason: "too_long" };

  const updated = await db
    .update(comments)
    .set({ body, editedAt: new Date() })
    .where(
      and(
        eq(comments.id, input.commentId),
        eq(comments.authorUserId, input.authorUserId),
        eq(comments.status, "active"),
      ),
    )
    .returning();

  const comment = updated[0];
  if (!comment) return { ok: false, reason: "not_found" };
  return { ok: true, comment };
}

// status → 'deleted'; row survives for placeholder rendering. No-op for a
// non-owner or already-non-active row.
export async function softDeleteComment(
  db: Db,
  input: { commentId: string; authorUserId: string },
): Promise<{ ok: boolean }> {
  const updated = await db
    .update(comments)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(
      and(
        eq(comments.id, input.commentId),
        eq(comments.authorUserId, input.authorUserId),
        eq(comments.status, "active"),
      ),
    )
    .returning({ id: comments.id });
  return { ok: updated.length > 0 };
}

// Active comments plus any non-active one still referenced by an active reply.
// viewerId drives viewerIsAuthor/viewerLiked; null for signed-out readers.
export async function listCommentsForReport(
  db: Db,
  input: {
    reportId: string;
    viewerId?: string | null;
    sort?: CommentSort;
    limit?: number;
    offset?: number;
  },
): Promise<CommentView[]> {
  const viewerId = input.viewerId ?? null;
  const limit = Math.min(input.limit ?? 20, 100);
  const offset = input.offset ?? 0;
  const orderBy =
    input.sort === "top"
      ? sql`ORDER BY like_count DESC, c.created_at DESC, c.id DESC`
      : sql`ORDER BY c.created_at DESC, c.id DESC`;

  const rows = await db.execute<{
    id: string;
    body: string | null;
    status: "active" | "hidden" | "deleted";
    author_label: string | null;
    viewer_is_author: boolean;
    created_at: Date;
    edited_at: Date | null;
    like_count: number;
    viewer_liked: boolean;
    quoted_question_id: string | null;
    quoted_text: string | null;
    reply_to_comment_id: string | null;
    reply_to_author_label: string | null;
    reply_to_snippet: string | null;
    reply_to_status: "active" | "hidden" | "deleted" | null;
  }>(sql`
    SELECT
      c.id,
      CASE WHEN c.status = 'active' THEN c.body END AS body,
      c.status,
      CASE WHEN c.display_attribution = 'display_name'
           THEN COALESCE(au.display_name, au.username) END AS author_label,
      COALESCE(c.author_user_id = ${viewerId}::uuid, false) AS viewer_is_author,
      c.created_at,
      c.edited_at,
      COALESCE(lc.n, 0) AS like_count,
      (vl.user_id IS NOT NULL) AS viewer_liked,
      c.quoted_question_id,
      CASE WHEN c.status = 'active' THEN c.quoted_text END AS quoted_text,
      c.reply_to_comment_id,
      CASE WHEN p.display_attribution = 'display_name'
           THEN COALESCE(pu.display_name, pu.username) END AS reply_to_author_label,
      CASE WHEN p.status = 'active' THEN LEFT(p.body, ${REPLY_PREVIEW_CHARS}) END AS reply_to_snippet,
      p.status AS reply_to_status
    FROM comments c
    JOIN users au ON au.id = c.author_user_id
    LEFT JOIN comments p ON p.id = c.reply_to_comment_id
    LEFT JOIN users pu ON pu.id = p.author_user_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n FROM comment_likes cl WHERE cl.comment_id = c.id
    ) lc ON true
    LEFT JOIN comment_likes vl
      ON vl.comment_id = c.id AND vl.user_id = ${viewerId}::uuid
    WHERE c.report_id = ${input.reportId}::uuid
      AND (
        c.status = 'active'
        OR EXISTS (
          SELECT 1 FROM comments ch
           WHERE ch.reply_to_comment_id = c.id AND ch.status = 'active'
        )
      )
    ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    status: r.status,
    authorLabel: r.author_label,
    viewerIsAuthor: r.viewer_is_author,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    likeCount: Number(r.like_count),
    viewerLiked: r.viewer_liked,
    quotedQuestionId: r.quoted_question_id,
    quotedText: r.quoted_text,
    replyToCommentId: r.reply_to_comment_id,
    replyTo: r.reply_to_comment_id
      ? {
          authorLabel: r.reply_to_author_label,
          snippet: r.reply_to_snippet,
          status: r.reply_to_status ?? "deleted",
        }
      : null,
  }));
}

export async function countCommentsForReport(
  db: Db,
  reportId: string,
): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM comments WHERE report_id = ${reportId}::uuid AND status = 'active'`,
  );
  return Number(rows[0]?.n ?? 0);
}

// Batched active-comment counts; ids with no comments are absent from the map.
export async function countCommentsForReports(
  db: Db,
  reportIds: string[],
): Promise<Map<string, number>> {
  if (reportIds.length === 0) return new Map();
  const rows = await db
    .select({
      reportId: comments.reportId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(comments)
    .where(
      and(inArray(comments.reportId, reportIds), eq(comments.status, "active")),
    )
    .groupBy(comments.reportId);
  return new Map(rows.map((r) => [r.reportId, Number(r.count)]));
}

// Counts comments in the window regardless of status (a deleted one still used a slot).
async function reachedRateLimit(db: Db, authorUserId: string): Promise<boolean> {
  const since = new Date(Date.now() - COMMENT_WINDOW_MS);
  const rows = await db
    .select({ id: comments.id })
    .from(comments)
    .where(
      and(
        eq(comments.authorUserId, authorUserId),
        gte(comments.createdAt, since),
      ),
    )
    .limit(COMMENT_RATE_LIMIT);
  return rows.length >= COMMENT_RATE_LIMIT;
}
