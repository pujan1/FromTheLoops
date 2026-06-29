import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { VIEW_AS_COOKIE } from "@/lib/view-as-cookie";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/settings(.*)",
  "/submit(.*)",
  "/drafts(.*)",
  // /admin requires a session here; requireAdmin() (lib/admin.ts) then checks
  // the allowlist in the page itself (404 for non-admins).
  "/admin(.*)",
]);

// User-write surfaces that must be unreachable during a read-only "view as"
// session (Sprint 6 Day 9). /dashboard is the view-as surface itself, and /admin
// stays reachable so an admin can still navigate out — both excluded here.
const isImpersonationBlockedRoute = createRouteMatcher([
  "/settings(.*)",
  "/submit(.*)",
  "/drafts(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
  // Presence of the cookie alone gates here (cheap, edge-safe). The actual
  // impersonation is admin-gated when consumed; a non-admin who hand-sets the
  // cookie only blocks their own writes — self-inflicted, not a security hole.
  if (
    isImpersonationBlockedRoute(request) &&
    request.cookies.get(VIEW_AS_COOKIE)
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
