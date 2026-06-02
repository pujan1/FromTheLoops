# E2E (Playwright)

End-to-end tests for the web app. Sprint 1 covers the submission flow:
`login → fill top-level fields → autosave → leave → resume → continue`, plus
the Day 8 honeypot rejection path.

## Running

```bash
# from repo root or apps/web
pnpm --filter @fromtheloop/web e2e
```

The suite is self-contained:

- **Browser** — runs against the system Google Chrome (`channel: "chrome"` in
  `playwright.config.ts`), so there's no Playwright browser download. If you'd
  rather use the bundled Chromium, run `pnpm --filter @fromtheloop/web
  e2e:install` and drop the `channel` line.
- **Dev server** — Playwright starts `pnpm dev` itself (`webServer`) and reuses
  an already-running one on :3000.
- **Database** — expects the migrated + seeded dev DB (`pnpm db:migrate &&
  pnpm db:seed`). The tests assert against the curated taxonomy (e.g. Stripe,
  Software Engineer).
- **Auth** — `global.setup.ts` calls Clerk's `clerkSetup()` to mint a testing
  token (bypasses the sign-up Turnstile that loops for automated browsers) and
  ensures the test user exists via the Clerk Backend API. Sign-in is
  email-ticket based — no password round-trip. Needs `CLERK_SECRET_KEY` +
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/web/.env.local`.

## Notes

- `CLERK_TELEMETRY_DISABLED=1` is forced in the config so the Clerk backend
  SDK's telemetry timer doesn't keep the worker alive past the run.
- The test user defaults to `e2e+clerk_test@fromtheloop.dev` (override with
  `E2E_CLERK_USER_EMAIL`). The `+clerk_test` subaddress makes it a Clerk test
  identity — no real email is sent.
