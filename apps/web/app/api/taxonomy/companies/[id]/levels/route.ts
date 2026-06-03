import { auth } from "@clerk/nextjs/server";
import { getCompanyLevels, getDb } from "@fromtheloop/db";

// Per-company level ladder for the submission form's Level field. Signed-in
// only. Empty array = company has no ladder → the form falls back to "N/A".
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("Bad company id", { status: 400 });
  }

  const levels = await getCompanyLevels(getDb(), id);
  return Response.json({ levels });
}
