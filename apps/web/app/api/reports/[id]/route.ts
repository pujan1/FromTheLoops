import { countHelpfulFlags, getDb } from "@fromtheloop/db";
import { getCachedReportPeekBody } from "@/lib/report-detail-cache";

// ADR-0010 — detail feed for the client triage pane. Returns the SAME public
// report the SSR page (`/reports/[id]`) renders, as a wire-safe view, so the
// pane and the page show one representation. Public read only: gated on the
// identical visibility filter (`active AND deleted_at IS NULL`) — a pending /
// deleted / owned-but-not-public / guessed id returns null and 404s here,
// exactly as the page does, so nothing leaks.
//
// The near-immutable body (content + attribution) comes from the server data
// cache (getCachedReportPeekBody), invalidated in lockstep with edit/delete; the
// volatile helpful count is read live per request so the cache never pins it.
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

  // The one volatile field, fetched OUTSIDE the cached body so a stepped-through
  // peek always shows the current count even when the body is a cache hit.
  const helpfulCount = await countHelpfulFlags(getDb(), peek.detail.id);

  const body = JSON.stringify({
    detail: peek.detail,
    authorName: peek.authorName,
    helpfulCount,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The server data cache carries the body across requests; the browser
      // hold is the pane's own in-memory Map, so the HTTP layer stays no-store
      // (the count is per-request and must not be held by a shared cache).
      "cache-control": "private, no-store",
    },
  });
}
