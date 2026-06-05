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

- 2026-06-04: **Days 1–2 done** (aggregate schema + SQL; refresh proc + partition strategy + refresh-time test). db tests 91 → **100** (9 new in `aggregates.test.ts`); db typecheck + `drizzle-kit generate` (no pending diff) clean; worker + web typecheck clean.
  - **Core decision — summary TABLE, not a native matview.** A Postgres `MATERIALIZED VIEW` can only be refreshed *whole* (`REFRESH [CONCURRENTLY]` recomputes every row), which directly defeats this sprint's required mitigation: "refresh only the affected `(company, role, level)` partition." So `aggregates_company_role_level` is an **incrementally-maintained regular table** — each row **is** one cell ("partition") — recomputed per-cell via `refresh_aggregate_cell(company_id, role_id, level)` (UPSERT; deletes the row if the cell has no live reports left). `refresh_all_aggregates()` is the full backfill (drops orphan cells, loops every distinct live cell, returns the count). The deliverable's word "matview" is honored *in spirit*; the table is the only shape that supports the Day 3–4 LISTEN/NOTIFY → worker → refresh-one-cell flow. **This is the ADR-0003 (Day 10) headline decision.**
  - **Trust weighting** (PLAN.md §Aggregation weighting) lives in one IMMUTABLE SQL function `report_trust_weight(evidence_verified bool)`. V1 only wires the `evidence_verified` boolean, so the mapping collapses to `{true → 1.0, false → 0.3}` (verified-employee vs unverified); the 0.7 verified-pro / recruiter-confirmed tiers get a write path in a later sprint — extend that one function. Mirrored in TS as `reportTrustWeight` / `REPORT_TRUST_WEIGHTS`.
  - **What a cell stores:** `report_count`; raw outcome buckets (`outcome_offer/reject/withdrew/ghosted/pending`; NULL outcomes count only toward `report_count`); `trust_weighted_count` = SUM(trust weight); `median_round_count` (`percentile_cont(0.5)`, LEFT JOIN so 0-round reports count as n=0); `mode_round_sequence` (modal ordered `round_type[]` via `mode() WITHIN GROUP` — arrays are sortable; 0-round reports don't sway it); `top_topics` jsonb (≤10, `{topic_id,slug,name,count,weighted_count}` ranked by trust-weighted question-occurrence frequency); `refreshed_at`.
  - **Visibility filter:** only `status='active' AND deleted_at IS NULL` reports feed the aggregate — exactly the rows the Sprint 4 wedge page may render publicly. `pending_moderation` / `deleted` never leak in (unit-tested). NB: in V1 nothing flips a report to `active` yet (the Sprint 2 moderation policy holds everything at `pending_moderation`), so live aggregates are empty until Sprint 6 mod tooling promotes reports — the pipeline is correct and tested by inserting `active` rows directly.
  - **Where it lives.** Hand-written migration **0008** (`0008_aggregates_company_role_level.sql`) is what the migrator applies; the readable annotated source is `packages/db/views/aggregates_company_role_level.sql` (the deliverable's stated home). The two are kept **byte-identical** (executable statements) and a test asserts it — single applied source, no silent drift. Meta wiring mirrors 0002/0004: `0008_snapshot.json` is a copy of 0007's with a new `id` / `prevId`→0007, so `drizzle-kit generate` stays diff-free (the table/functions aren't Drizzle-modeled, same as the trgm indexes). TS surface in `packages/db/src/aggregates.ts`: `refreshAggregateCell` / `refreshAllAggregates` / `getAggregate` + `CompanyRoleLevelAggregate` types, exported from the package index.
  - **Refresh-time check:** a 60-report busy cell refreshes in well under the 60s exit-criterion budget (test asserts <10s with huge margin). Per-cell refresh is O(cell size), not O(table), so it never degrades as cells accumulate.
  - **Deferred to later Sprint 3 days (unchanged):** event emitter + LISTEN/NOTIFY + `events` table fallback (Day 3); `refresh-aggregate` worker job + retry/idempotency (Day 4); Typesense schemas/indexer/backfill (Days 5–6); sparse-data fallback `scope.ts` (Day 7); `/admin/health` (Day 8); end-to-end latency measurement (Day 9); ADR-0003 (Day 10) — which will document the table-not-matview decision above. The `pnpm backfill:aggregates` script (Day 6) will wrap `refreshAllAggregates`.

- 2026-06-04: **Days 3–4 done** (event outbox + LISTEN/NOTIFY + fallback poller; `refresh-aggregate` worker job with retry + idempotency). db tests 100 → **109** (new `events.test.ts` + a live NOTIFY-fires test + a migration trigger assertion); db/core/shared tests green; worker typecheck + build + lint clean; web/core typecheck clean; `drizzle-kit generate` no pending diff.
  - **Transactional-outbox design.** New `events` table is an append-only log written **inside the same transaction as each report write** (so event ⇔ committed report, atomically). An AFTER INSERT trigger (`notify_event`, migration 0010) fires `pg_notify('events', id)` on commit — the worker LISTENs and wakes in milliseconds (fast path), but the row is the source of truth and a fallback poller sweeps anything a dropped NOTIFY missed. Risk-table mitigation ("every submit also writes to events table; worker has a fallback polling job") implemented exactly.
  - **Two-consumer fan-out, wired one.** The sprint commits to the aggregate refresh **and** the Typesense indexer (Day 6) both consuming the same event, "retried independently." So the event row carries **separate** `aggregate_processed_at` / `search_processed_at` drain markers (each with its own partial index for a cheap pending-sweep). Day 3–4 wires only the aggregate consumer; `search_processed_at` is reserved for Day 6 — no rework needed then.
  - **Event shape:** `{op: created|updated|deleted, report_id, company_id, canonical_role_id, level}`. The cell is denormalized onto the row (no FK to reports — the log must survive a hard-delete and a delete event still needs to name the cell). createReport → one `created`; updateReport → `updated` for the new cell, **plus** a second `updated` for the vacated old cell when an edit moves the report's (company/role/level); softDeleteReport → one `deleted`. All emitted in-tx; softDeleteReport is now wrapped in a transaction to do so.
  - **db surface** (`packages/db/src/events.ts`): `EVENTS_CHANNEL`, `emitReportEvent(tx, …)`, `getEventById`, `claimUnprocessedAggregateEvents`, `markAggregateEventProcessed`, `countUnprocessedAggregateEvents` (the latter feeds Day 8 `/admin/health` lag). The aggregate consumer's testable core is `refreshAggregateForEvent(db, eventId)` in `aggregates.ts` — loads the event, refreshes its cell, marks it drained; **idempotent** (missing/already-drained → no-op; cell recompute is itself idempotent), so BullMQ retries and the poller racing the NOTIFY path are all safe.
  - **Day 4 — worker** (`apps/worker/`): new `refresh-aggregate` BullMQ queue with two job kinds — `event` (per-event, `jobId=evt:<id>` to dedupe NOTIFY re-delivery; `attempts:5` + exponential backoff so a transient DB error or a mid-job kill doesn't lose the refresh) and a repeatable `sweep` (every 30s) that drains unprocessed events inline as the dropped-NOTIFY fallback. `listen.ts` holds one dedicated postgres.js connection LISTENing on `events` and enqueues an `event` job per notification (best-effort; durability is the table + sweep). Both fan into the idempotent `refreshAggregateForEvent`. Shutdown closes the listener first, then workers, then the queues + DB pool.
  - **Testing boundary:** the emit→claim→refresh→mark loop, idempotency, the move-cell double-emit, delete-empties-cell, and the live `pg_notify` trigger are all covered at the db layer (real testcontainer). The BullMQ/LISTEN **transport** (queue add, retry, sweep scheduler) is typecheck/build-verified only — same gated-env boundary Sprint 2 used for worker/E2E. Exit criteria "BullMQ retry verified" + "kill mid-job, restart, no lost work" rest on `attempts:5` + the events-table-as-truth + the sweep; a manual kill-test on the box is the remaining belt-and-suspenders check.
  - **⚠️ Worker redeploy needed (manual).** Materially new worker code (LISTEN bridge + refresh-aggregate queue/sweep). No **new** env var (DATABASE_URL was already wired in Sprint 2 for the purge cron), so compose is unchanged — but the hand-shipped image must be rebuilt + re-shipped to Hetzner or the new queue/listener won't run on the box.
  - **Note:** the `events` log grows unbounded (processed rows are never pruned yet). A retention/prune pass belongs with the Sprint 6 reconciliation job; flagged, out of Day 3–4 scope.
