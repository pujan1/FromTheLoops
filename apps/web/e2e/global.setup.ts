import { clerkSetup } from "@clerk/testing/playwright";

// Playwright global setup (Sprint 1 Day 9).
//
// 1. clerkSetup() mints a Clerk testing token from CLERK_SECRET_KEY and exposes
//    it to the tests. setupClerkTestingToken() (called inside clerk.signIn)
//    attaches it so Clerk skips the Turnstile bot challenge that otherwise
//    loops forever for an automated browser — the exact blocker the earlier
//    sprint days hit.
// 2. ensureTestUser() makes the E2E sign-in target exist. Idempotent: look it
//    up by email, create it via the Backend API only if missing. The email
//    uses the "+clerk_test" subaddress so Clerk treats it as a test identity
//    (no real mail sent, fixed OTP) — sign-in here is ticket-based, so no
//    password round-trip is needed.

export const E2E_EMAIL =
  process.env.E2E_CLERK_USER_EMAIL ?? "e2e+clerk_test@fromtheloop.dev";

const CLERK_API = "https://api.clerk.com/v1";

async function ensureTestUser(): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("global-setup: CLERK_SECRET_KEY is not set");
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };

  const query = new URLSearchParams({ email_address: E2E_EMAIL });
  const lookup = await fetch(`${CLERK_API}/users?${query}`, { headers });
  if (!lookup.ok) {
    throw new Error(
      `global-setup: user lookup failed (${lookup.status}): ${await lookup.text()}`,
    );
  }
  const existing = (await lookup.json()) as unknown[];
  if (Array.isArray(existing) && existing.length > 0) return;

  const create = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email_address: [E2E_EMAIL],
      password:
        process.env.E2E_CLERK_USER_PASSWORD ?? "ftl-e2e-Str0ng-pw-2026",
      skip_password_checks: true,
    }),
  });
  if (!create.ok) {
    throw new Error(
      `global-setup: user create failed (${create.status}): ${await create.text()}`,
    );
  }
}

export default async function globalSetup(): Promise<void> {
  await clerkSetup();
  await ensureTestUser();
}
