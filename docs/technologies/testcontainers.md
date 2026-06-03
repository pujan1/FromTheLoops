# Testcontainers

## Role In FromTheLoop

Testcontainers starts real PostgreSQL containers for database tests. This lets the test suite validate migrations, SQL constraints, extensions, and query plans against an actual database.

## Where It Lives

- Dependency: `packages/db/package.json`
- Global setup: `packages/db/tests/global-setup.ts`
- Helpers: `packages/db/tests/helpers.ts`
- Tests: `packages/db/tests/**`

## Workflow Integration

The db test suite uses Testcontainers to boot Postgres 16, apply migrations, and expose a real Drizzle client to tests.

```ts
// packages/db/tests/migration.test.ts
import { makeTestClient, type TestDb } from "./helpers.js";

let db: TestDb;
let close: () => Promise<void>;

beforeAll(() => {
  const { db: d, client } = makeTestClient();
  db = d;
  close = () => client.end({ timeout: 5 });
});
```

## Tradeoffs And Gotchas

- Real containers catch migration and constraint bugs that mocks miss.
- Docker must be running for db tests.
- Warm Docker daemon runs are fast; cold starts cost more time.
- Tests should close clients so containers can shut down cleanly.

## Common Workflow

1. Start Docker.
2. Run `pnpm --filter @fromtheloop/db test`.
3. Add assertions against catalog tables, SQLSTATE errors, and query plans for schema changes.
4. Keep test setup reusable through `helpers.ts`.
