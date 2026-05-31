import { auth } from "@clerk/nextjs/server";
import { getDb, searchCompanies } from "@fromtheloop/db";

// Company autocomplete for the submission form (Sprint 1 Day 3). Signed-in
// only — taxonomy lookup is a data-creation affordance, not public read.
// Node runtime: postgres.js needs Node, not the edge runtime.
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  const matches = await searchCompanies(getDb(), query);
  // No active match → the form offers "Suggest new company" (creates a
  // pending row on submit). Companies allow inline suggest; roles do not.
  const canSuggestNew = query.trim().length > 0 && matches.length === 0;

  return Response.json({ matches, canSuggestNew });
}
