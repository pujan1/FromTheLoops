"use server";

// Server actions for the report conversation (ADR-0011): comment CRUD, the
// casual post/comment likes, the page-load comment fetch, and best-effort share
// telemetry. Every guard (auth, length, rate limit, self-like, ownership, quote/
// reply integrity, active-report-only) is enforced in the @fromtheloop/db data
// layer — these actions resolve the viewer, call the db, and surface the result.
// The client UI gates affordances for UX, but a hand-crafted call can't slip
// past the server checks.

import { currentUser } from "@clerk/nextjs/server";
import {
  type CommentSort,
  type CommentView,
  countPostLikes,
  createComment,
  editComment,
  getDb,
  getOrCreateUserByClerkId,
  hasUserLikedComment,
  hasUserLikedPost,
  insertAnalyticsEvents,
  likeComment,
  likePost,
  listCommentsForReport,
  softDeleteComment,
  unlikeComment,
  unlikePost,
} from "@fromtheloop/db";
import { revalidatePath } from "next/cache";
import { routes } from "@/lib/routes";
import { COMMENTS_PAGE_SIZE } from "./comments-config";

// Resolve the signed-in viewer's internal id, or null when signed out.
async function resolveViewerId(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  const internal = await getOrCreateUserByClerkId(getDb(), {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });
  return internal.id;
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface LoadCommentsResult {
  comments: CommentView[];
  hasMore: boolean;
}

// Fetch a page of comments for the report, viewer-aware (drives viewerIsAuthor /
// viewerLiked). Reads limit+1 to know whether a "Load more" remains.
export async function loadCommentsAction(input: {
  reportId: string;
  sort: CommentSort;
  offset: number;
}): Promise<LoadCommentsResult> {
  const viewerId = await resolveViewerId();
  const page = await listCommentsForReport(getDb(), {
    reportId: input.reportId,
    viewerId,
    sort: input.sort,
    limit: COMMENTS_PAGE_SIZE + 1,
    offset: input.offset,
  });
  const hasMore = page.length > COMMENTS_PAGE_SIZE;
  return { comments: page.slice(0, COMMENTS_PAGE_SIZE), hasMore };
}

export type CreateCommentResult = { ok: true } | { ok: false; error: string };

export async function createCommentAction(input: {
  reportId: string;
  body: string;
  displayAttribution: "display_name" | "anonymous";
  quotedQuestionId?: string | null;
  replyToCommentId?: string | null;
}): Promise<CreateCommentResult> {
  const viewerId = await resolveViewerId();
  if (!viewerId) return { ok: false, error: "not_signed_in" };

  const res = await createComment(getDb(), {
    reportId: input.reportId,
    authorUserId: viewerId,
    body: input.body,
    displayAttribution: input.displayAttribution,
    quotedQuestionId: input.quotedQuestionId ?? null,
    replyToCommentId: input.replyToCommentId ?? null,
  });
  if (!res.ok) return { ok: false, error: res.reason };

  // Refresh the SSR first page + its count for the next hard load.
  revalidatePath(routes.report(input.reportId));
  return { ok: true };
}

export async function editCommentAction(input: {
  reportId: string;
  commentId: string;
  body: string;
}): Promise<CreateCommentResult> {
  const viewerId = await resolveViewerId();
  if (!viewerId) return { ok: false, error: "not_signed_in" };

  const res = await editComment(getDb(), {
    commentId: input.commentId,
    authorUserId: viewerId,
    body: input.body,
  });
  if (!res.ok) return { ok: false, error: res.reason };

  revalidatePath(routes.report(input.reportId));
  return { ok: true };
}

export async function deleteCommentAction(input: {
  reportId: string;
  commentId: string;
}): Promise<{ ok: boolean }> {
  const viewerId = await resolveViewerId();
  if (!viewerId) return { ok: false };

  const res = await softDeleteComment(getDb(), {
    commentId: input.commentId,
    authorUserId: viewerId,
  });
  if (res.ok) revalidatePath(routes.report(input.reportId));
  return res;
}

// ── Likes ────────────────────────────────────────────────────────────────────

export interface LikeActionResult {
  liked: boolean;
  count: number;
  error?: "not_signed_in" | "self_like" | "not_found";
}

// Toggle the viewer's like on the post. Decides like-vs-unlike from DB truth (a
// stale page or double-tap can't desync). Returns the live count for the badge.
export async function togglePostLikeAction(
  reportId: string,
): Promise<LikeActionResult> {
  const viewerId = await resolveViewerId();
  if (!viewerId) {
    return { liked: false, count: await countPostLikes(getDb(), reportId), error: "not_signed_in" };
  }
  const db = getDb();
  if (await hasUserLikedPost(db, reportId, viewerId)) {
    const res = await unlikePost(db, { reportId, userId: viewerId });
    return { liked: false, count: res.count };
  }
  const res = await likePost(db, { reportId, userId: viewerId });
  if (res.ok) return { liked: true, count: res.count };
  return { liked: false, count: await countPostLikes(db, reportId), error: res.reason };
}

export async function toggleCommentLikeAction(
  commentId: string,
): Promise<LikeActionResult> {
  const viewerId = await resolveViewerId();
  const db = getDb();
  if (!viewerId) {
    return { liked: false, count: 0, error: "not_signed_in" };
  }
  if (await hasUserLikedComment(db, commentId, viewerId)) {
    const res = await unlikeComment(db, { commentId, userId: viewerId });
    return { liked: false, count: res.count };
  }
  const res = await likeComment(db, { commentId, userId: viewerId });
  if (res.ok) return { liked: true, count: res.count };
  return { liked: false, count: 0, error: res.reason };
}

// ── Share telemetry ──────────────────────────────────────────────────────────

// Best-effort: record that the report was shared. Never throws into the UI —
// telemetry must not break a share.
export async function logShareAction(reportId: string): Promise<void> {
  try {
    await insertAnalyticsEvents(getDb(), [
      { name: "report_share", props: { reportId } },
    ]);
  } catch {
    // swallow — telemetry is fire-and-forget
  }
}
