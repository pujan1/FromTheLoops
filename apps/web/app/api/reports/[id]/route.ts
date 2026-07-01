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

// Detail feed for the client triage pane (ADR-0010). The near-immutable body is
// served from the server data cache; viewer-specific engagement (likes, comment
// count, commenter identity) is read live and never cached, so one viewer's state
// can't leak into another's (the route is `private, no-store`).
export const runtime = "nodejs"; // postgres.js needs Node, not edge

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const peek = await getCachedReportPeekBody(id);
  if (!peek) return new Response("Not found", { status: 404 });

  const db = getDb();

  const user = await currentUser();
  let viewerId: string | null = null;
  if (user) {
    const internal = await getOrCreateUserByClerkId(db, {
      clerkId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
    });
    viewerId = internal.id;
  }

  // Comments lazy-fetch on expand (initial: []); only the count is needed up front.
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
      // null: the conversation view doesn't surface the Helpful flag.
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
      // no-store: engagement is per-viewer and must never sit in a shared cache.
      "cache-control": "private, no-store",
    },
  });
}
