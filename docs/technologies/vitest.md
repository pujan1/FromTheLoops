# Vitest

## Role In FromTheLoop

Vitest is the test runner for workspace packages. It is currently most important in `packages/db`, where it verifies migrations, constraints, seeds, query plans, enum behavior, and draft/taxonomy helpers.

## Where It Lives

- DB config: `packages/db/vitest.config.ts`
- Shared config: `packages/shared/vitest.config.ts`
- Tests: `packages/db/tests/**`, `packages/shared/tests/**`
- Root script: `pnpm test`

## Workflow Integration

The db package runs:

```bash
pnpm --filter @fromtheloop/db test
```

Migration tests assert that expected database objects exist:

```ts
const rows = await db.execute<{ table_name: string }>(sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
`);

expect(new Set(rows.map((r) => r.table_name))).toContain("interview_reports");
```

## Tradeoffs And Gotchas

- Vitest is fast and fits TypeScript packages well.
- Database tests are integration tests, not mocks, so Docker must be available.
- Some packages still have placeholder test scripts.
- Query-plan tests are intentionally specific because key indexes are product-critical.

## Common Workflow

1. Add focused tests near the package that owns the behavior.
2. For db changes, test both schema shape and behavior.
3. Run package tests first, then `pnpm test` before broader changes land.
