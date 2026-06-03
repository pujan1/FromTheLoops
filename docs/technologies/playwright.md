# Playwright

## Role In FromTheLoop

Playwright runs end-to-end browser tests for the web app. It is currently configured for the submission flow and Clerk-aware browser setup.

## Where It Lives

- Config: `apps/web/playwright.config.ts`
- E2E tests: `apps/web/e2e/**`
- Package scripts: `apps/web/package.json`

## Workflow Integration

Install the browser once:

```bash
pnpm --filter @fromtheloop/web e2e:install
```

Run tests:

```bash
pnpm --filter @fromtheloop/web e2e
```

## Tradeoffs And Gotchas

- Playwright tests real browser behavior and catches regressions that unit tests miss.
- Auth flows need stable test setup and Clerk test helpers.
- E2E tests are slower than package tests, so keep them focused on critical workflows.
- Local app and dependent services may need to be running depending on config.

## Common Workflow

1. Add E2E coverage for a user-critical path.
2. Keep selectors stable and user-facing.
3. Use Clerk testing helpers for authenticated flows.
4. Run package tests before E2E when debugging server-side failures.
