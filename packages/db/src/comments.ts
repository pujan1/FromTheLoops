// Comments data-access (ADR-0011).
//
// Flat discussion on a report. This module owns the write guards (length, rate
// limit, active-report-only, quote/reply integrity) and the anonymity-safe read.
//
// Anonymity is enforced HERE, not left to the caller: the read never returns an
// anonymous comment's author_user_id. Instead it returns a derived `authorLabel`
// (the display name only when the comment opted into display_name) and a
// server-computed `viewerIsAuthor` (so the owner gets edit/delete controls
// without the payload ever linking an anonymous comment back to an account). A
// leak here would unmask anonymous commenters, so the boundary is the schema's
// job, not the web layer's.

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { comments, users } from "./schema/index.js";
import * as schema from "./schema/index.js";
import type { Comment } from "./schema/comments.js";

type Db = PostgresJsDatabase<typeof schema>;

// Body bounds + posting rate limit (ADR-0011). Tunable launch defaults. The
// rate limit is a rolling 24h window per author (the helpful-flags pattern):
// bounds burst posting, which is the spam vector we care about.
export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_RATE_LIMIT = 100;
export const COMMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
// How much of a referenced comment's body to inline as the reply preview.
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

// The anonymity-safe shape the web layer renders. No raw author_user_id.
export interface CommentView {
  id: string;
  // null once the body has been PII-purged, or for a non-active (deleted/hidden)
  // row kept only because something references it.
  body: string | null;
  status: "active" | "hidden" | "deleted";
  // Display name/username when the comment is attributed; null when anonymous.
  authorLabel: string | null;
  // Computed against the signed-in viewer; false for signed-out readers.
  viewerIsAuthor: boolean;
  createdAt: Date;
  editedAt: Date | null;
  likeCount: number;
  viewerLiked: boolean;
  // Quote-a-question: the snapshot (stable display) + the FK (jump-to, while it
  // still exists).
  quotedQuestionId: string | null;
  quotedText: string | null;
  // Reply-to-a-comment: the FK + an inlined, anonymity-safe preview of the
  // parent (null parent fields when the parent is gone/removed).
  replyToCommentId: string | null;
  replyTo: {
    authorLabel: string | null;
    snippet: string | null;
    status: "active" | "hidden" | "deleted";
  } | null;
}

// ── Writes ───────────────────────────────────────────────────────────────────

// Create a comment. Instant (status defaults to 'active'). Runs the guards in
// cheap-first order, snapshots the quoted question's prose at quote-time, and
// resolves the author's default attribution when the caller doesn't override it.
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

  // Comments only on an ACTIVE (public) report.
  const reportRows = await db.execute<{ status: string }>(
    sql`SELECT status FROM interview_reports WHERE id = ${input.reportId}::uuid LIMIT 1`,
  );
  if (reportRows[0]?.status !== "active") {
    return { ok: false, reason: "report_not_available" };
  }

  if (await reachedRateLimit(db, input.authorUserId)) {
    return { ok: false, reason: "rate_limited" };
  }

  // Quote a question: it must belong to THIS report. Snapshot its prose now.
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

  // Reply to a comment: it must be an active comment on THIS report.
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

  // Default attribution to the author's account default when not overridden.
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

// Edit own comment. Allowed anytime while active; stamps edited_at. Scoped to
// (id, author, active) so a non-owner / deleted row updates nothing.
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

// Soft-delete own comment: status → 'deleted', stamp deleted_at. The row
// survives so replies/quotes pointing at it render a placeholder; the body is
// cleared later by the 90-day PII purge. No-op (not_found) for a non-owner or an
// already-non-active row.
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

// ── Reads ────────────────────────────────────────────────────────────────────

// The thread read. Returns active comments plus any non-active comment still
// referenced by an active reply (so the placeholder resolves), newest-first or
// top (most-liked) — both anonymity-safe. viewerId drives viewerIsAuthor /
// viewerLiked; pass null for signed-out readers.
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

// Count of visible (active) comments on a report — the detail-page badge.
export async function countCommentsForReport(
  db: Db,
  reportId: string,
): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM comments WHERE report_id = ${reportId}::uuid AND status = 'active'`,
  );
  return Number(rows[0]?.n ?? 0);
}

// Batched active-comment counts for list/card surfaces (ADR-0011). Map keyed by
// report id; ids with no comments are absent. Empty input → empty map.
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

// Has this author hit the rolling-24h posting cap? Counts their comments in the
// window regardless of status (a deleted comment still consumed a post slot),
// riding comments_author_idx + the created_at filter.
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
