import { currentUser } from "@clerk/nextjs/server";
import {
  countCommentsForReport,
  countPostLikes,
  getDb,
  getOrCreateUserByClerkId,
  getUserById,
  hasUserLikedPost,
} from "@fromtheloop/db";
import { getCachedReportPeekBody } from "@/lib/report-detail-cache";

// ADR-0010 — detail feed for the client triage pane. Returns the SAME public
// report the SSR page (`/reports/[id]`) renders, as a wire-safe view, so the
// pane and the page show one representation. Public read only: gated on the
// identical visibility filter (`active AND deleted_at IS NULL`) — a pending /
// deleted / owned-but-not-public / guessed id returns null and 404s here,
// exactly as the page does, so nothing leaks.
//
// The near-immutable body (content + attribution) comes from the server data
// cache (getCachedReportPeekBody), invalidated in lockstep with edit/delete. The
// volatile, viewer-specific engagement (post-like state, comment count, the
// commenter's own identity) is read live per request so the pane can render the
// full conversation (ADR-0011) in place — never cached, so it can't go stale or
// leak one viewer's state to another (the route is `private, no-store`).
//
// Node runtime: postgres.js needs Node, not edge (same as /api/export).
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const peek = await getCachedReportPeekBody(id);
  if (!peek) return new Response("Not found", { status: 404 });

  const db = getDb();

  // Resolve the viewer (if signed in) so the conversation can render the
  // viewer's own like state + commenting identity. Mirrors the SSR page.
  const user = await currentUser();
  let viewerId: string | null = null;
  if (user) {
    const internal = await getOrCreateUserByClerkId(db, {
      clerkId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
    });
    viewerId = internal.id;
  }

  // Viewer-aware engagement, all read OUTSIDE the cached body. Comments start
  // collapsed in the pane (initial: []) and lazy-fetch on expand via the
  // self-authed loadCommentsAction — so j/k triage never pays for a thread it
  // doesn't open; only the count is needed up front for the collapsed pill.
  const [postLikeCount, viewerLikedPost, commentCount, viewerUser] =
    await Promise.all([
      countPostLikes(db, peek.detail.id),
      viewerId
        ? hasUserLikedPost(db, peek.detail.id, viewerId)
        : Promise.resolve(false),
      countCommentsForReport(db, peek.detail.id),
      viewerId ? getUserById(db, viewerId) : Promise.resolve(null),
    ]);

  const body = JSON.stringify({
    detail: peek.detail,
    authorName: peek.authorName,
    signedIn: viewerId !== null,
    engagement: {
      postLike: { liked: viewerLikedPost, count: postLikeCount },
      // Unused by the conversation view, which doesn't surface the verified
      // Helpful flag — kept null to satisfy the shared engagement shape.
      helpful: null,
      comments: { initial: [], hasMore: false, count: commentCount },
      commenter: {
        displayName: viewerUser?.displayName ?? viewerUser?.username ?? null,
        defaultAttribution:
          viewerUser?.defaultDisplayAttribution ?? "anonymous",
      },
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The server data cache carries the body across requests; the browser
      // hold is the pane's own in-memory Map. The HTTP layer stays no-store —
      // the engagement is per-viewer and must never sit in a shared cache.
      "cache-control": "private, no-store",
    },
  });
}
