import {
  getDb,
  getPublicReportDetail,
  getUserById,
  type ReportDetailView,
  toReportDetailView,
} from "@fromtheloop/db";
import { unstable_cache } from "next/cache";

// ADR-0010 — the server-side cache for the triage peek body. The pane's
// `/api/reports/:id` endpoint is the hot path (a hover-prefetch + a peek for
// every row, across every visitor), and the body it returns is near-immutable:
// a report's content + attribution only change on an in-place edit or a
// soft-delete. So we cache that body in Next's data cache, keyed per report and
// tagged for precise invalidation, and let repeated peeks skip the DB entirely.
//
// What is and isn't cached:
//   - CACHED: the report content (`detail`) + the resolved attribution byline
//     (`authorName`). Only edit-finalize and soft-delete change these — both
//     fire `revalidateTag(reportDetailTag(id))` (see app/reports/[id]/actions.ts
//     and app/submit/actions.ts), so the cache turns over in lockstep with the
//     mutation. This is the "correctness coupling to watch" the ADR calls out.
//   - NOT cached here: the helpful count. It's the one volatile field, so the
//     route fetches it per request OUTSIDE this cache — caching the body must
//     never staleness-pin a live count.
//
// The 1h `revalidate` is a backstop, not the primary freshness mechanism: tag
// invalidation handles edit/delete instantly; the TTL only bounds staleness for
// a transition the tags don't cover yet (e.g. a moderation pending→active flip,
// whose surface will add its own tag bust when built).

export interface ReportPeekBody {
  detail: ReportDetailView;
  authorName: string | null;
}

// The invalidation tag for one report's cached body. Shared by the cache
// definition here and the `revalidateTag` calls at every mutation site, so the
// string is never duplicated (and never drifts) across them.
export function reportDetailTag(id: string): string {
  return `report-detail:${id}`;
}

// Public-read-only, exactly like the route + SSR page: a pending / deleted /
// owned-but-not-public / guessed id resolves to null (and 404s upstream),
// leaking nothing. The null is itself cached under the TTL backstop above.
export function getCachedReportPeekBody(
  id: string,
): Promise<ReportPeekBody | null> {
  const load = unstable_cache(
    async (reportId: string): Promise<ReportPeekBody | null> => {
      const db = getDb();
      const detail = await getPublicReportDetail(db, reportId);
      if (!detail) return null;

      // Attribution byline: a display_name report shows the author's name; an
      // anonymous one stays anonymous. Resolved here (it needs a users lookup
      // the deep read skips) and cached alongside the body. Mirrors the page.
      let authorName: string | null = null;
      if (detail.displayAttribution === "display_name") {
        const author = await getUserById(db, detail.report.createdByUserId);
        authorName = author?.displayName ?? author?.username ?? null;
      }

      return { detail: toReportDetailView(detail), authorName };
    },
    ["report-peek-body", id],
    { tags: [reportDetailTag(id)], revalidate: 3600 },
  );
  return load(id);
}
