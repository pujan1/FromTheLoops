// Admin / moderation gating.
//
// Two layers protect the privileged surfaces:
//   1. middleware.ts requires a signed-in session for /admin(.*).
//   2. requireRole() (below) asserts the caller clears a role bar, calling
//      notFound() otherwise — a 404, not a 403, so the route's existence isn't
//      even advertised to the under-privileged.
//
// Role model (Sprint 6 Day 1): the source of truth is Clerk publicMetadata.role
// surfaced through the session token (see lib/roles.ts). On top of that there's
// a break-glass env allowlist — ADMIN_CLERK_IDS, comma-separated Clerk ids —
// that resolves to super_admin unconditionally. It exists to bootstrap the
// first admins and to guarantee a way in if session-token metadata is ever
// misconfigured. Granular moderator/admin grants flow through Clerk metadata.

import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { isRole, roleAtLeast, type Role } from "./roles";

export function adminClerkIds(): string[] {
  return (process.env.ADMIN_CLERK_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminClerkId(clerkId: string | null | undefined): boolean {
  if (!clerkId) return false;
  return adminClerkIds().includes(clerkId);
}

// Resolve a caller's effective role from their id + session claims. The env
// allowlist wins (break-glass super_admin); otherwise the validated metadata
// role; otherwise the floor, `user`. Pure given its inputs so callers that
// already hold an auth() result don't pay for a second await.
function resolveRole(
  userId: string | null | undefined,
  sessionClaims: CustomJwtSessionClaims | null | undefined,
): Role {
  if (!userId) return "user";
  if (isAdminClerkId(userId)) return "super_admin";
  const claimed = sessionClaims?.metadata?.role;
  return isRole(claimed) ? claimed : "user";
}

// The caller's effective role. For UI affordances (show/hide a nav link); use
// requireRole() to actually gate a route.
export async function getRole(): Promise<Role> {
  const { userId, sessionClaims } = await auth();
  return resolveRole(userId, sessionClaims);
}

// Server-component / route-handler guard. Returns the caller's Clerk id, or
// short-circuits with notFound() if they don't clear `min`.
export async function requireRole(min: Role): Promise<string> {
  const { userId, sessionClaims } = await auth();
  if (!userId) notFound();
  if (!roleAtLeast(resolveRole(userId, sessionClaims), min)) notFound();
  return userId;
}

// Convenience guards for the two bars the moderation surfaces care about.
export function requireModerator(): Promise<string> {
  return requireRole("moderator");
}

export function requireAdmin(): Promise<string> {
  return requireRole("admin");
}
