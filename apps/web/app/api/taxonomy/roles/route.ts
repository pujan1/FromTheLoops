import { auth } from "@clerk/nextjs/server";
import { getDb, searchRoles } from "@fromtheloop/db";

// Canonical-role autocomplete for the submission form. Signed-in only. Roles
// are a closed canonical set: there is deliberately NO "suggest new"
// affordance here — the response is matches-only, unlike the companies endpoint.
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  const matches = await searchRoles(getDb(), query);
  return Response.json({ matches });
}
