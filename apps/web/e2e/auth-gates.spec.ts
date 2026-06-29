import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Error paths for the auth boundary — the routes that must NOT render to the
// wrong principal. Two layers are under test:
//
//   1. middleware.ts `auth.protect()` — signed-out access to a protected route
//      redirects to /sign-in (NEXT_PUBLIC_CLERK_SIGN_IN_URL) instead of leaking
//      the page.
//   2. requireAdmin() (lib/admin.ts) — a signed-in but under-privileged user
//      hitting /admin gets notFound() (HTTP 404), so the surface's existence
//      isn't even advertised. The default E2E user carries no role metadata and
//      isn't in ADMIN_CLERK_IDS, so it is exactly that under-privileged caller.
//
// Requires the gated E2E env (CLERK_SECRET_KEY + a seeded DB).

// Every authenticated-write surface listed in middleware's isProtectedRoute.
// /drafts uses a random id — the redirect fires before the draft is ever
// resolved, so the id only has to be route-shaped.
const PROTECTED = [
  "/submit",
  "/dashboard",
  "/settings",
  "/drafts/00000000-0000-0000-0000-000000000000",
  "/admin",
];

test.describe("signed-out: protected routes redirect to sign-in", () => {
  for (const path of PROTECTED) {
    test(`${path} → /sign-in`, async ({ page }) => {
      await page.goto(path);
      // Clerk appends ?redirect_url=… so match the path loosely.
      await expect(page).toHaveURL(/\/sign-in/);
    });
  }
});

test.describe("signed-in non-admin: /admin is hidden", () => {
  test("/admin returns 404 for a non-privileged user", async ({ page }) => {
    await signIn(page);

    // Past middleware's session check (we're authed), the page's requireAdmin()
    // calls notFound() — a 404 document, not a 403.
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
  });

  test("a deep /admin route is hidden too", async ({ page }) => {
    await signIn(page);
    const res = await page.goto("/admin/blocklist");
    expect(res?.status()).toBe(404);
  });
});
