# Dev Setup

> Last verified: 2026-06-02

Get a working local environment. Two tracks: **frontend** (`apps/web`) and
**backend** (`apps/worker` + `packages/*`). Most people start with frontend.

## Prerequisites (everyone)

- Node `>=20` (`.node-version` pins 20), pnpm `>=9` via Corepack: `corepack enable`
- Docker (for local Postgres + Redis + Typesense)
- Repo bootstrap:
  ```bash
  pnpm install
  cp .env.example apps/web/.env.local   # web reads .env.local
  cp .env.example apps/worker/.env       # worker reads .env
  pnpm docker:up                          # postgres :5432, redis :6379, typesense :8108
  ```
- Fill in `CLERK_*` keys from the Clerk dashboard (auth won't work without them).
  Everything else in `.env.example` defaults to the local Docker stack.

Stores and their env vars: Postgres (`DATABASE_URL`), Redis (`REDIS_URL`),
Typesense (`TYPESENSE_*`), R2 (`R2_*`), Clerk (`CLERK_*`). See
[technologies/](../technologies/) for one page per tool.

---

## Frontend setup (`apps/web`)

Next.js app. Needs Postgres (for reads) and Clerk (for auth). Redis/Typesense
only matter once you hit search or queue-backed pages.

```bash
pnpm docker:up          # if not already running
pnpm db:migrate         # apply schema to local Postgres
pnpm db:seed            # optional: sample data to render against
pnpm dev                # next dev → http://localhost:3000
```

Checks before pushing:
```bash
pnpm --filter @fromtheloop/web typecheck
pnpm --filter @fromtheloop/web lint
pnpm --filter @fromtheloop/web e2e        # Playwright; first run: pnpm --filter @fromtheloop/web e2e:install
```

E2E uses a Clerk `+clerk_test` identity created on the fly — see the comments in
`.env.example` and `apps/web/e2e/global.setup.ts`.

---

## Backend setup (`apps/worker` + `packages/*`)

The worker consumes BullMQ jobs from Redis and writes to Postgres. Redis is the
**broker**, not just a cache — keep that in mind below.

```bash
pnpm docker:up          # redis + postgres must be up
pnpm db:migrate         # worker and web share one schema
pnpm worker:dev         # tsx watch → processes jobs as they arrive
```

Verify the loop end to end:
```bash
pnpm --filter @fromtheloop/worker enqueue:hello   # push a test job
# worker log should show it picked up and processed
```

Useful package scripts:
- `packages/db`: `pnpm --filter @fromtheloop/db generate` (new migration from schema),
  `... migrate`, `... seed`, `... studio` (Drizzle Studio).
- Checks: `pnpm --filter @fromtheloop/worker typecheck|lint`, `pnpm -r test`.

---

## Working locally against server data

Every store is env-var driven, so you can point local code at the box. Each
store behaves differently:

- **Postgres** — easiest and safest. Don't hit the prod Neon branch directly;
  create a **Neon branch** off prod (copy-on-write, isolated) and put its URL in
  `DATABASE_URL`. Real data, free to mutate, can't break prod.
- **Redis** — reachable at `rediss://default:<pw>@box.pujan.tech:6380` (TLS).
  ⚠️ It's the BullMQ broker: a **local worker pointed at prod Redis will consume
  real production jobs**. Safe for cache/read inspection only. If you run the
  worker locally, keep Redis local (`redis://localhost:6379`).
- **Typesense** — not exposed externally (`expose`-only in prod compose). Reach
  it via SSH tunnel: `ssh -L 8108:localhost:8108 <you>@box.pujan.tech`. Same
  trick reaches plain Redis on `6379` without TLS.
- **R2** — already cloud. Drop prod `R2_*` creds in and you're on the same
  bucket; writes/deletes are real, so prefer a dev bucket if mutating.
- **Clerk** — if you point at the prod DB, user rows reference **prod Clerk user
  IDs**. Use prod Clerk keys too or local sign-ins won't match the data.

**Recommended "prod-ish data" combo:** Neon branch for `DATABASE_URL`, local
Redis + Typesense, prod Clerk keys, prod R2 only if you need the assets. Gives
you real data without a local worker eating the prod job queue.

---

## Troubleshooting

- **Ports in use** — `pnpm docker:down` then `pnpm docker:up`; check nothing else
  owns 5432 / 6379 / 8108.
- **Migrations out of sync** — re-run `pnpm db:migrate`; for a clean slate,
  `pnpm docker:down` drops the volumes' contents only if you also `docker volume rm`.
- **Worker idle** — confirm `REDIS_URL` resolves and Redis is healthy
  (`docker ps`), then re-run `enqueue:hello`.
- **Auth bounces** — `CLERK_*` keys missing or mismatched with the DB you're on.
</content>
</invoke>
