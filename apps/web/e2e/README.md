# E2E (Playwright)

End-to-end tests for the web app.

- `submission.spec.ts` (Sprint 1) — `login → fill top-level → autosave → leave
  → resume → continue`, suggest-new company, and the honeypot drop path.
- `report-lifecycle.spec.ts` (Sprint 2 Day 10) — the full happy path: submit a
  complete report → land on its owner view → enter edit → soft-delete.
- `abuse.spec.ts` (Sprint 2 Day 10) — the regex block list rejects a
  submission carrying contact info.

Shared form-driving helpers live in `helpers.ts`.

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
- `report-lifecycle.spec.ts` deletes its report at the end. Because of the
  per-company cap (1 live report/company/user), a run that crashes mid-way can
  leave a Stripe report that makes the next run's submit fail as a duplicate —
  clear it from the dev DB if a rerun reports "You already have a report for
  this company."

## Sprint 2 exit-criteria walkthrough

Where each Sprint 2 exit criterion is verified (E2E here, or the
integration/unit layer where a browser run would be brittle):

| Exit criterion | Verified by |
|---|---|
| Complete a full report (basics + round + question + tag) and submit | `report-lifecycle.spec.ts` (E2E); `core/tests/submit.test.ts` (writes the full tree) |
| Report + rounds + questions + tag joins present after submit | `core/tests/submit.test.ts`, `db/tests/reports.test.ts` |
| Within 24h: Edit CTA; after 24h: only Soft delete | `report-lifecycle.spec.ts` (Edit + Delete states); `db/tests/reports.test.ts` (`isReportEditable` clock) |
| Soft delete sets `status='deleted'`, data retained | `report-lifecycle.spec.ts` (deleted state); `db/tests/reports.test.ts` (`softDeleteReport`) |
| 90-day PII purge clears free-text on a fixture row | `db/tests/reports.test.ts` (`purgeDeletedReportPii`); worker job `purge-deleted-pii` |
| Confirmation email within 60s | `notifications` queue: web renders + enqueues, worker sends via Resend (manual: submit with a real `RESEND_API_KEY`) |
| 11th submission in 24h rejected | `slidingWindowRateLimit` (`RATE_LIMITS.submitReport`, 10/day) |
| "call me at 555-1234" rejected by the regex block | `abuse.spec.ts` (E2E); `core/tests/regex.test.ts` (unit) |
