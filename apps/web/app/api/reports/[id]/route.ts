import {
  countHelpfulFlags,
  getDb,
  getPublicReportDetail,
  getUserById,
  toReportDetailView,
} from "@fromtheloop/db";

// ADR-0010 — detail feed for the client triage pane. Returns the SAME public
// report the SSR page (`/reports/[id]`) renders, as a wire-safe view, so the
// pane and the page show one representation. Public read only: gated on the
// identical visibility filter (`active AND deleted_at IS NULL`) via
// getPublicReportDetail — a pending / deleted / owned-but-not-public / guessed id
// returns null and 404s here, exactly as the page does, so nothing leaks.
//
// Node runtime: postgres.js needs Node, not edge (same as /api/export).
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const db = getDb();

  const detail = await getPublicReportDetail(db, id);
  if (!detail) return new Response("Not found", { status: 404 });

  // Attribution byline is viewer-agnostic for a public report: a display_name
  // report shows the author's name; an anonymous one stays anonymous. Resolved
  // here (it needs a users lookup the deep read skips) and sent alongside the
  // view, never inside it. Mirrors the page's attribution logic.
  let authorName: string | null = null;
  if (detail.displayAttribution === "display_name") {
    const author = await getUserById(db, detail.report.createdByUserId);
    authorName = author?.displayName ?? author?.username ?? null;
  }

  // Helpful count is the one volatile field — fetched separately (ADR-0010) so a
  // future server-cache of the near-immutable body never staleness-pins the count.
  const helpfulCount = await countHelpfulFlags(db, detail.report.id);

  const body = JSON.stringify({
    detail: toReportDetailView(detail),
    authorName,
    helpfulCount,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Stage 1: no server-side body cache yet (the client Map + prefetch carry
      // speed). Deferred until the edit/delete invalidation coupling is built.
      "cache-control": "private, no-store",
    },
  });
}
