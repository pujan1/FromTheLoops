# @fromtheloop/search

Thin wrapper around the Typesense client. Owns:

- Collection schemas (reports, companies, topics, …)
- Indexers consumed by [@fromtheloop/worker](../../apps/worker/) on the `search-index` queue
- Faceted query helpers consumed by [@fromtheloop/web](../../apps/web/)

## Why this is its own package

Source of truth is Postgres ([@fromtheloop/db](../db/)); Typesense is a query-shape projection. Keeping them in separate packages forces the boundary to stay clean and makes drift easier to spot.

## Layout (Sprint 3)

- `src/env.ts` — `TYPESENSE_*` connection config (defaults to local docker).
- `src/client.ts` — `getSearchClient()`, the one place a Typesense client is constructed (singleton, like `getDb()`).
- `src/schemas/` — committed collection schemas: `reports`, `companies`, `topics`.
- `src/provision.ts` — `ensureCollections()` (idempotent create-if-missing) + `collectionDocCounts()`. The worker calls it on boot; `pnpm --filter @fromtheloop/search provision` runs it one-shot.
- `src/indexers/` — build docs from `@fromtheloop/db` rows and upsert/delete them. Driven by the events outbox via the worker's `index-typesense` job.

## Provisioning

```sh
pnpm docker:up                                  # local Typesense on :8108
pnpm --filter @fromtheloop/search provision     # create the collections
```

On Hetzner the worker self-provisions on boot (same as it upserts BullMQ schedulers).
