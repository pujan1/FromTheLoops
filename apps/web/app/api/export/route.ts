import { currentUser } from "@clerk/nextjs/server";
import {
  getDb,
  getOrCreateUserByClerkId,
  getUserDataExport,
} from "@fromtheloop/db";

// "Export my data" — streams a JSON dump of everything the signed-in user has
// authored (reports + rounds + questions, drafts, account, verification
// status). Signed-in only. Node runtime: postgres.js needs Node, not edge.
//
// The Content-Disposition: attachment header makes the browser download a file
// rather than render the JSON inline; the settings page's link sets the
// suggested filename.
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  const data = await getUserDataExport(db, internal.id);
  if (!data) return new Response("Not found", { status: 404 });

  const body = JSON.stringify(data, null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="fromtheloop-export.json"',
      // Personal data — never cache at any layer.
      "cache-control": "no-store",
    },
  });
}
