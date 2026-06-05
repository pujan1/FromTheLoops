// Admin gating (Sprint 3 Day 8). There's no RBAC in V1 — users.role is a
// deferred field (see schema/users.ts) — so /admin is gated by an explicit
// allowlist of Clerk user ids in the ADMIN_CLERK_IDS env var (comma-separated).
// Cheap, reversible, and trivially swapped for a real role check later.
//
// Two layers protect /admin:
//   1. middleware.ts requires a signed-in session for /admin(.*).
//   2. requireAdmin() (below) asserts the signed-in id is on the allowlist,
//      calling notFound() otherwise — a 404, not a 403, so the route's
//      existence isn't even advertised to non-admins.

import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

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

// Server-component / route-handler guard. Returns the admin's Clerk id, or
// short-circuits with notFound() if the caller isn't an allowlisted admin.
export async function requireAdmin(): Promise<string> {
  const { userId } = await auth();
  if (!isAdminClerkId(userId)) notFound();
  return userId!;
}
