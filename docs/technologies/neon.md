# Neon

## Role In FromTheLoop

Neon is the planned production Postgres provider. It gives the app a managed Postgres database with serverless-friendly connection behavior and future branch-per-environment workflows.

## Where It Lives

- Database client: `packages/db/src/index.ts`
- Env var: `DATABASE_URL`
- Architecture reference: `docs/architecture.md`

## Workflow Integration

The db package uses `postgres` with Drizzle. Prepared statements are disabled so the same client works with Neon's pooled endpoint and local Postgres:

```ts
// packages/db/src/index.ts
const client = postgres(url, { max: 10, prepare: false });
const db = drizzle(client, { schema });
```

Vercel server functions use `DATABASE_URL` to connect to Neon. Local development can use the Docker Postgres URL instead.

## Tradeoffs And Gotchas

- Neon branching is a good fit for dev/staging/prod isolation once wired.
- Serverless connection pooling matters when Vercel creates many function instances.
- Transaction-mode pooling does not preserve prepared statement state, so `prepare: false` is intentional.
- Local Docker Postgres remains useful because tests and migrations can run without relying on cloud state.

## Common Workflow

1. Use local Docker Postgres while developing schema changes.
2. Commit migrations from `packages/db/src/migrations`.
3. Point environment-specific `DATABASE_URL` values at the correct Neon branch.
4. Keep pooled endpoint behavior in mind when changing database driver settings.
