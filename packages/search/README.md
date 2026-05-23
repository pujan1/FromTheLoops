# @fromtheloop/search

Thin wrapper around the Typesense client. Owns:

- Collection schemas (reports, companies, topics, …)
- Indexers consumed by [@fromtheloop/worker](../../apps/worker/) on the `search-index` queue
- Faceted query helpers consumed by [@fromtheloop/web](../../apps/web/)

## Why this is its own package

Source of truth is Postgres ([@fromtheloop/db](../db/)); Typesense is a query-shape projection. Keeping them in separate packages forces the boundary to stay clean and makes drift easier to spot.

## Sprint 0 deliverable

Connection helper that pings Typesense and prints health. Real schemas land in Sprint 3.
