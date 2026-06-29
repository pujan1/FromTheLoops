// "View as user" — read-only admin impersonation (Sprint 6 Day 9).
//
// What it is: an admin can render a target user's private owner surface (the
// dashboard) as that user sees it, for debugging. It is deliberately *read-only*:
//
//   1. It never touches the Clerk session. Every write still executes as the real
//      admin principal (server actions resolve the actor via currentUser(), never
//      this cookie), so impersonation can NEVER produce content attributed to the
//      target.
//   2. On top of that, writes are refused while impersonating — protected write
//      routes are blocked in middleware, and the public report/comment write
//      actions call assertNotImpersonating(). Belt and suspenders.
//
// The cookie holds the target's internal users.id. Only enterViewAs() (admin-
// gated) sets it; getImpersonation() re-checks the admin role on every read, so a
// non-admin who hand-sets the cookie sees nothing impersonated.

import { cookies } from "next/headers";
import { getUserById, type Database } from "@fromtheloop/db";
import { getRole } from "./admin";
import { roleAtLeast } from "./roles";
import { VIEW_AS_COOKIE } from "./view-as-cookie";

export { VIEW_AS_COOKIE };

export type Impersonation = {
  targetUserId: string;
  username: string | null;
  displayName: string | null;
};

// The raw cookie value (a target users.id) or null. Does NOT verify the caller
// is an admin — callers that act on it must gate. Used by assertNotImpersonating
// and middleware, where presence alone is the signal.
export async function getViewAsTargetId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(VIEW_AS_COOKIE)?.value ?? null;
}

// The active impersonation for the current request, or null. Admin-gated: a
// non-admin (or signed-out) caller always gets null even if the cookie is set.
export async function getImpersonation(db: Database): Promise<Impersonation | null> {
  const targetId = await getViewAsTargetId();
  if (!targetId) return null;
  if (!roleAtLeast(await getRole(), "admin")) return null;

  const target = await getUserById(db, targetId);
  if (!target) return null; // stale cookie (user deleted) — banner just won't show
  return {
    targetUserId: target.id,
    username: target.username,
    displayName: target.displayName,
  };
}

// Guard for mutating server actions reachable from non-protected routes (report
// + comment writes). Refuses while a view-as session is active so a write can't
// fire mid-impersonation. Presence-based — always safe to refuse on the cookie.
export async function assertNotImpersonating(): Promise<void> {
  if (await getViewAsTargetId()) {
    throw new Error("Exit “view as” mode to perform this action.");
  }
}
