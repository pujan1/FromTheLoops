# PostgreSQL

## Role In FromTheLoop

PostgreSQL is the source of truth for users, companies, roles, reports, rounds, questions, drafts, verifications, and moderation logs. Search and job systems may denormalize from Postgres, but canonical data starts here.

## Where It Lives

- Local container: `docker-compose.yml`
- Schema: `packages/db/src/schema/**`
- Migrations: `packages/db/src/migrations/**`
- Query helpers: `packages/db/src/*.ts`
- Tests: `packages/db/tests/**`

## Workflow Integration

Local Postgres runs in Docker on port 5432:

```yaml
# docker-compose.yml
postgres:
  image: postgres:16
  environment:
    POSTGRES_USER: fromtheloop
    POSTGRES_PASSWORD: fromtheloop
    POSTGRES_DB: fromtheloop
  ports:
    - "5432:5432"
```

Migrations and seed data are run through the db package:

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed
```

## Tradeoffs And Gotchas

- Relational constraints are valuable for this product because reports have deep parent/child structure.
- Postgres is authoritative; Typesense is an index and can drift.
- `pg_trgm` is enabled for taxonomy autocomplete and guarded by migration tests.
- Hard deletes are intentionally restricted in key areas to preserve report and moderation audit trails.

## Common Workflow

1. Change Drizzle schema files under `packages/db/src/schema`.
2. Generate a migration with `pnpm --filter @fromtheloop/db generate`.
3. Run `pnpm db:migrate`.
4. Add or update tests that assert constraints, indexes, and query plans.
