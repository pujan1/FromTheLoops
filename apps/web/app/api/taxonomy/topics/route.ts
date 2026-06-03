import { auth } from "@clerk/nextjs/server";
import { getDb, searchTopics } from "@fromtheloop/db";

// Topic-tag autocomplete for the question tagger. Signed-in only — taxonomy
// lookup is a data-creation affordance, not public read. Node runtime:
// postgres.js needs Node, not the edge runtime. Mirrors the companies endpoint
// (suggest-new ON); roles, by contrast, are a closed set with no suggestion.
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  const matches = await searchTopics(getDb(), query);
  // No active match → the form offers "Suggest new topic" (creates a pending
  // row on finalize). Pending tags stay out of searchTopics, so a suggested
  // tag never satisfies the ≥1-active-tag rule until a mod promotes it.
  const canSuggestNew = query.trim().length > 0 && matches.length === 0;

  return Response.json({ matches, canSuggestNew });
}
