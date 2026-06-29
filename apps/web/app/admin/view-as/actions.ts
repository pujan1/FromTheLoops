"use server";

// Enter / exit "view as user" — read-only admin impersonation (Sprint 6 Day 9).
// Both re-assert requireAdmin(). Entering logs a `view_as` mod_action_logs row
// (the plan requires it: impersonation is audited even though it mutates nothing)
// and sets the cookie lib/view-as.ts reads; exiting clears it. See lib/view-as.ts
// for the read-only guarantees.

import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getDb,
  getOrCreateUserByClerkId,
  getUserById,
  logModAction,
} from "@fromtheloop/db";
import { requireAdmin } from "@/lib/admin";
import { routes } from "@/lib/routes";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

export async function enterViewAs(targetUserId: string): Promise<void> {
  await requireAdmin();

  const admin = await currentUser();
  if (!admin) redirect(routes.dashboard);

  const db = getDb();
  const target = await getUserById(db, targetUserId);
  if (!target) throw new Error("That user no longer exists.");

  const adminInternal = await getOrCreateUserByClerkId(db, {
    clerkId: admin.id,
    email: admin.primaryEmailAddress?.emailAddress ?? null,
  });
  // Don't let an admin "view as" themselves — it's a no-op that would still log.
  if (adminInternal.id === target.id) redirect(routes.dashboard);

  await logModAction(db, {
    modUserId: adminInternal.id,
    actionType: "view_as",
    targetType: "user",
    targetId: target.id,
    metadata: { username: target.username },
  });

  const jar = await cookies();
  jar.set(VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1h — a debugging session, not a standing grant
  });

  redirect(routes.dashboard);
}

export async function exitViewAs(): Promise<void> {
  // No role gate needed: clearing the cookie only ever ends impersonation, which
  // is always safe (and the only way out for anyone holding the cookie).
  const jar = await cookies();
  jar.delete(VIEW_AS_COOKIE);
  redirect(routes.dashboard);
}
