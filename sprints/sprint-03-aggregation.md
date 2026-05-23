# Sprint 3 — Aggregation Pipeline & Search Indexing

> **Weeks 7–8**

## Goal

When a report is submitted, the aggregation pipeline produces the data that the canonical wedge page will render in Sprint 4, and Typesense indexes everything needed for search + faceted filtering.

## Why now

This is the **deepest invisible system** in V1. It has to exist before the wedge page (Sprint 4) can be built. Doing it earlier than Sprint 3 would have been premature (no real data shapes); doing it later would block UI work.

## In scope

- **Postgres materialized views** for canonical aggregates per `(company, role, level)`:
  - report count
  - outcome distribution
  - top topic tags (frequency-weighted)
  - common round structure (median round count, mode round-type sequence)
  - trust-tier-weighted score (per PLAN.md aggregation weighting)
- Refresh strategy: enqueue refresh job on report submit/edit/delete via Postgres `LISTEN/NOTIFY`; worker picks up, refreshes affected view partition
- **Typesense collections**:
  - `reports` — full text + facets (company, role, level, round-type, tags, outcome, trust-tier)
  - `companies` — for company search
  - `topics` — for `/topics` index page
- Indexer in worker: on submit/edit/delete, push to Typesense
- Sparse-data fallback logic: function returns `{ scope: 'exact' | 'tag' | 'role' }` based on count thresholds (<10 reports = broaden)
- Backfill scripts to populate matviews + Typesense from existing DB
- Aggregation lag visible to admins (a small `/admin/health` page showing queue depth + last-refresh-at)

## Out of scope

- Frontend rendering of aggregates (Sprint 4)
- Search UI (Sprint 4)
- Karma-weighted helpfulness signals (Sprint 5)
- Index optimization beyond "ships and is fast enough"

## Deliverables

| Artifact | Where |
|---|---|
| `aggregates_company_role_level` matview + refresh proc | `packages/db/views/` |
| Event emitter pattern in `packages/core/events/` | repo |
| Worker jobs: `refresh-aggregate`, `index-typesense` | `apps/worker/jobs/` |
| Typesense schema files committed | `packages/search/schemas/` |
| `packages/search/client.ts` typed client wrapper | repo |
| Sparse-data fallback function w/ unit tests | `packages/core/aggregation/scope.ts` |
| `pnpm backfill:aggregates` and `pnpm backfill:typesense` | repo |
| `/admin/health` page (basic) | `apps/web/app/admin/health/` |
| `docs/adr/0003-aggregation-strategy.md` | repo |

## Exit criteria

- [ ] Submitting a report triggers a `LISTEN/NOTIFY` event; worker picks it up within 5s
- [ ] Matview refresh completes within 60s of submission for a busy `(company, role, level)` cell
- [ ] Typesense returns the new report in search results within 30s of submission
- [ ] Backfill scripts can rebuild matviews + Typesense from a fresh DB in <10 minutes for seed data
- [ ] Sparse-data fallback function unit-tested: returns `'exact'` when ≥10 reports, `'role'` when <10
- [ ] `/admin/health` shows queue depth, last refresh per cell, and Typesense doc counts
- [ ] Killing the worker mid-job and restarting doesn't lose work (BullMQ retry verified)

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Matview refresh becomes the bottleneck as data grows | Partition matview by `(company, role, level)` from day 1; only refresh affected partition. ADR-0003 documents the partition strategy. |
| Typesense + matview drift (one updates, the other fails) | Both writes triggered by the same event, both retried independently. Daily reconciliation job (Sprint 6) catches drift. |
| LISTEN/NOTIFY drops messages under load | Backup: every submit also writes to `events` table; worker has a fallback polling job that picks up unprocessed events. |

## Dependencies

- Sprint 2 exit criteria — reports actually being created
- Typesense reachable from worker (Sprint 0)

## Day-by-day skeleton

| Day | Focus |
|---|---|
| 1 | Design matview schema; write SQL for `aggregates_company_role_level` |
| 2 | Refresh proc + partition strategy; test refresh time on seed data |
| 3 | Event emitter abstraction; LISTEN/NOTIFY plumbing + `events` table fallback |
| 4 | Worker job: `refresh-aggregate`; retry + idempotency |
| 5 | Typesense collection schemas; provision in dev + Hetzner |
| 6 | Indexer worker job; backfill script |
| 7 | Sparse-data fallback function + unit tests |
| 8 | `/admin/health` basic page; metrics exposed |
| 9 | End-to-end: submit → matview → Typesense, measured latencies |
| 10 | ADR-0003; buffer; exit criteria |

## Notes & decisions

_Append-only._
