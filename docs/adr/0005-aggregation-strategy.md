---
status: accepted
date: 2026-06-06
deciders: [pujan]
---

# ADR-0005 — Aggregation strategy: incremental summary table + Typesense facets

> Owed since Sprint 3 (Day 10 deliverable), written retroactively in Sprint 4
> alongside the role grain it now also covers. Records the decision the code
> already embodies (`views/aggregates_company_role_level.sql`, migration 0008)
> so it isn't reverse-engineered later.

## Context

The wedge/role pages need two different read shapes over the same corpus of
`active`, non-deleted interview reports:

1. **Position Y — precomputed insight per cell.** Outcome distribution, a
   trust-weighted volume, median round count, the modal round-type sequence, and
   top topics, for a `(company, role[, level])` cell. Read on nearly every
   indexable page; must be cheap and SSR-fast.
2. **Search — faceted full-text.** Free-text over interview prose plus facets
   (company, role, level, round-type, topic, trust, month), ranked, paginated.

These have opposite access patterns (one keyed point-read of a heavy rollup vs.
ranked text search with facet counts), so one store can't serve both well.

A further constraint from `PLAN.md`: on each submit/edit/delete we must **refresh
only the affected cell**, not recompute the world — aggregation has to stay
incremental as volume grows.

## Decision

**Position Y is an incrementally-maintained summary TABLE in Postgres; search is
a separate Typesense projection. Both are derived, single-sourced from Postgres,
and rebuildable from base rows.**

### Position Y — a summary table, not a native materialized view

- The aggregate is a plain `TABLE` (`aggregates_company_role_level`, and per
  [ADR-0009](0009-role-primary-browse-grain.md) also `aggregates_company_role`),
  one row per cell, upserted by a `refresh_aggregate_*()` plpgsql function that
  **recomputes exactly one cell** from the base tables.
- **Why not a Postgres `MATERIALIZED VIEW`:** a native matview only refreshes
  *whole* — `REFRESH MATERIALIZED VIEW` (even `CONCURRENTLY`) recomputes every
  row. The required "refresh only the affected partition" is impossible with it.
  A summary table where each row is one partition makes per-cell refresh a single
  `UPSERT`; `refresh_all_*()` is the full backfill / reconciliation.
- **Trust weighting** lives in one `IMMUTABLE` SQL function,
  `report_trust_weight(evidence_verified)` → `{true: 1.0, false: 0.3}` today
  (the 0.7 / recruiter-confirmed tiers get a write path later; this is the only
  place to extend). `trust_weighted_count = SUM(weight)` is the confidence signal
  that tempers sparse/unverified cells.
- **Visibility filter** is identical everywhere downstream:
  `status = 'active' AND deleted_at IS NULL`. `pending_moderation` / deleted rows
  never feed an aggregate (or search).
- **Readable source + drift guard.** The executable statements live in
  `views/*.sql` as the review-friendly source; the migration applies the
  identical bytes; a test asserts the two don't diverge.

### Refresh delivery — the event outbox

- A report write enqueues a row in an **events outbox**; a Postgres `NOTIFY`
  trigger wakes a listener (the Hetzner worker) which refreshes the affected
  cell(s). A repeatable **sweep** job drains any events a dropped `NOTIFY`
  missed. Both paths funnel through one idempotent handler, so a retry, a race,
  or a mid-job crash is always safe.
- A single write refreshes **both grains** (the level cell it landed in and the
  role cell above it) — see ADR-0009.

### Search — a Typesense projection (not Postgres)

- Full-text + faceting is **Typesense**, not Postgres FTS: it gives ranked
  search, typo tolerance, and facet counts out of the box, which Postgres
  `tsvector` + manual facet queries would reimplement worse.
- One Typesense doc per visible report (id == report uuid), denormalising the
  company/role names + child round-types + topic tags so a single query resolves
  a faceted result with **no Postgres round-trip**. Kept in sync by the **same
  outbox** (a separate consumer), so Postgres stays the single source of truth
  and Typesense is disposable/rebuildable (`pnpm backfill:typesense`).

## Alternatives considered

| Option | Why not |
|---|---|
| Native `MATERIALIZED VIEW` for Position Y | Whole-view refresh only; can't refresh one cell. The core requirement. |
| Compute Position Y on the fly per request | A heavy multi-join (median, mode-sequence, weighted top-topics) on every page render; the wedge page is the most-hit, most-cacheable surface — precompute wins. |
| Postgres FTS (`tsvector`) for search | Reimplements ranking, typo tolerance, and facet counts that Typesense gives for free; worse results, more code. |
| Trigger-based synchronous refresh (refresh inside the write txn) | Couples write latency to aggregate cost + ties the writer to Typesense availability. The outbox decouples both and makes retries first-class. |
| One store for both reads | Opposite access patterns (keyed rollup read vs. ranked faceted text); neither store is good at the other's job. |

## Consequences

### Positive
- Position Y reads are a single indexed point-read of a precomputed row — SSR-
  fast, cacheable, the basis for the Day-9 LCP headroom.
- Incremental: a write touches O(its cells), not the whole table.
- Derived + rebuildable: both the table and the Typesense index can be dropped
  and rebuilt from Postgres; no bespoke source of truth to corrupt.
- Crash-safe refresh: outbox + idempotent handler + sweep fallback.

### Negative
- Two derived stores to keep in lockstep with base rows (mitigated: one outbox,
  idempotent handlers, full-backfill reconcilers, drift tests).
- Eventual consistency: a just-submitted report appears after its event drains
  (sub-second via NOTIFY; bounded by the sweep interval if NOTIFY drops). Fine —
  submissions are held at `pending_moderation` until a human approves anyway.

### Neutral / open
- The 0.7 / recruiter-confirmed trust tiers aren't wired (only the 1.0/0.3 split
  is); `report_trust_weight()` is the single extension point.
- Aggregating arbitrary live filter combinations into Position Y is out of scope
  — only the precomputed cells are shown (see ADR-0009).

## References

- `packages/db/views/aggregates_company_role_level.sql` + migration 0008 (level grain); `aggregates_company_role.sql` + migration 0011 (role grain).
- `packages/db/src/aggregates.ts` (reads + refresh wrappers); `packages/db/src/events.ts` (outbox); `apps/worker/src/jobs/refresh-aggregate.ts` (consumer).
- `packages/search/` — the Typesense projection (schemas, indexers, query).
- [ADR-0009](0009-role-primary-browse-grain.md) — the role grain layered on this strategy. [ADR-0001](0001-stack-choice.md) — Typesense choice.
