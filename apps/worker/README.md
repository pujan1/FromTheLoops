# @fromtheloop/worker

Long-running Node process. Runs on the Hetzner CX22 inside Docker alongside Redis + Typesense.

## Responsibilities

- Consumes BullMQ queues:
  - `aggregation` — refresh Postgres materialized views after writes
  - `search-index` — keep Typesense in sync with Postgres
  - `notifications` — dispatch transactional email via Resend
  - `purge-deleted-pii` — daily cron (BullMQ JobScheduler) that scrubs the free
    text of reports soft-deleted longer than 90 days (Sprint 2 Day 7)
- Subscribes to Postgres `LISTEN/NOTIFY` to enqueue work in response to write events

## Environment

Reads `.env.local` / `.env` from the repo root (via `src/env.ts`) in local dev;
production gets its env from the compose file. The purge job needs
`DATABASE_URL` (it calls `getDb()`); all queues need `REDIS_URL`.

## Not responsible for

- Anything user-facing or HTTP-shaped — that's [@fromtheloop/web](../web/)
- Schema definitions or migrations — those live in [@fromtheloop/db](../../packages/db/)

## Local boot

```bash
pnpm docker:up        # start Postgres + Redis + Typesense
pnpm worker:dev       # tsx watch src/index.ts
```

## Sprint 0 — Day 5 deliverable

A BullMQ "hello" job processes locally, then ships to Hetzner Day 6.
