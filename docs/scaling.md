# Scaling roadmap

> The ordered list of bottlenecks this stack hits as DAU grows, and the fix queued for each. Living doc — edit as real telemetry replaces these estimates.
>
> *For the **why** behind the stack see [ADR-0001](adr/0001-stack-choice.md). For **what we run today** see [architecture.md](architecture.md).*

The DAU thresholds below are approximate — the **order** is the durable part, not the exact number. Don't pre-build for load you don't have; just know what breaks next and have the fix ready.

## The reframe that sets the order

FromTheLoop is a **read-heavy, SEO-driven** product. That single fact decides the sequence:

- Most traffic is **anonymous readers** on programmatic pages (`/companies/[c]/[r]/[l]`, topics, stats). So **DAU → Postgres read load** is the dominant axis, and **caching** is the highest-leverage lever.
- **Clerk MAU counts only *authenticated* users** — a small fraction of DAU — so the auth ceiling arrives much later than a naive "DAU = MAU" estimate would suggest.
- **Writes are write-light and already async** behind BullMQ, so submission spikes are absorbed by the queue, not by request-path latency.

## The ladder at a glance

| # | Breaks at (~DAU) | What breaks | Fix | Cost |
|---|---|---|---|---|
| 1 | 300–800 | Neon free tier autosuspends → cold-start TTFB hurts SEO; Vercel Hobby nears 100GB bandwidth + is non-commercial by ToS | Vercel Pro + Neon Launch (kill scale-to-zero); confirm Neon **pooled** endpoint, lower web-path `max` | ~$40/mo |
| 2 | 1k–3k | No caching → every pageview runs N queries on Neon | Turn on **ISR / `revalidate`** on aggregate pages | ~$0 |
| 3 | 5k–15k | Single `cax11` can't hold Redis + Typesense + worker (Typesense RAM grows with cumulative reports) | Bigger box, then split **Typesense** onto its own box / Typesense Cloud | ~$15–60/mo |
| 4 | 10k–30k | Postgres *primary* read + connection concurrency | Neon autoscale + **read replica**; split `getDb()` / `getReadDb()` | ~$69+/mo |
| 5 | 20k–40k | Clerk 10k **auth** MAU ceiling | Clerk Pro | ~$25/mo + usage |
| 6 | 30k–60k | Single box is now an unacceptable SPOF; manual worker deploy drifts | **Redis → Upstash, Typesense → Cloud/HA, worker → ≥2 instances**, automate deploy | ~$50–150/mo |
| 7 | 50k–80k | Search QPS + write/aggregation bursts | Scale Typesense cluster, more worker concurrency, batch aggregation, **rate-limit** submit/search | usage |
| 8 | 80k–100k | ~1M+ pv/day — tail latency, cache hit-rate, observability | Edge runtime, SWR tuning, queue-depth dashboards, in-region replicas | usage |

## Per-rung detail

### 1 — Free tier gives out (~300–800 DAU)
**Symptom:** Neon's scale-to-zero means the first request after idle pays a cold-start → spiky TTFB that hurts Core Web Vitals (the growth model). Vercel Hobby approaches its 100GB/mo bandwidth and is non-commercial by ToS.
**Fix:** Move to **Vercel Pro** + **Neon Launch** and disable scale-to-zero. At the same time do the cheap insurance: confirm `DATABASE_URL` points at Neon's **pooled (`-pooler`)** endpoint, and lower the postgres.js `max` for the web/serverless path in [`getDb()`](../packages/db/src/index.ts) (the long-lived worker keeps a larger pool). `prepare: false` is already set there for PgBouncer compatibility. This pre-empts the worst failure mode of rung 4.
**Exposes:** every read still renders against Postgres → #2.

### 2 — Uncached rendering hammers Postgres (~1k–3k DAU)
**Symptom:** with no ISR (today only a `force-dynamic` debug route exists), each of the now-thousands of daily pageviews runs N queries on Neon. Read QPS — dominated by anonymous SEO traffic — drives compute and p95 TTFB up.
**Fix:** turn on the deferred lever: `revalidate` / ISR + CDN on the aggregate pages (wedge, company, topic, stats). These tolerate the seconds-to-minutes aggregation lag ADR-0001 already accepts, so they cache cleanly. Biggest bang for the least effort, and it doubles as the CWV/SEO win.
**Exposes:** the shared Hetzner box, now serving a larger index and more search traffic → #3.

### 3 — The single box can't hold Redis + Typesense + worker (~5k–15k DAU)
**Symptom:** Typesense keeps its index in RAM and it grows with *cumulative* reports (not DAU); search QPS rises; the `cax11` (2 vCPU / 4 GB, ARM, Falkenstein) is shared with Redis + worker. Search latency climbs and worker lag appears.
**Fix:** vertical bump first (bigger Hetzner box — cheapest). Then split roles: pull **Typesense onto its own box or Typesense Cloud**, leaving Redis + worker separate. This also starts retiring the SPOF and addresses the US-latency trade-off already noted in [architecture.md](architecture.md) (cax11/Falkenstein vs cpx21/Ashburn, or front search with Typesense Cloud).
**Exposes:** Postgres primary read + connection limits → #4.

### 4 — Postgres primary read + connection concurrency (~10k–30k DAU)
**Symptom:** even with ISR, the *uncacheable* reads (dashboard, submit-path reads, search-backing queries, cache misses) plus rising lambda concurrency pressure the single Neon primary and its connection count.
**Fix:** scale Neon compute (autoscaling CU) and add a **read replica**, routing read-only aggregate queries to it. Because all DB access funnels through one chokepoint, this is a one-place change: split into `getDb()` (primary) and `getReadDb()` (replica). Keep the pooled endpoint; tune pool size per surface.
**Exposes:** Clerk's auth ceiling → #5.

### 5 — Clerk MAU ceiling (~20k–40k DAU)
**Symptom:** cumulative *authenticated* MAU (a fraction of DAU, but now large) crosses Clerk's 10k free limit; sign-in/up and webhook volume rise.
**Fix:** **Clerk Pro**; verify the Clerk → `users` webhook upsert path is idempotent and resilient (already follows the async pattern). Nothing architectural.
**Exposes:** the still-single-instance box/Redis as an unacceptable SPOF → #6.

### 6 — Retire the SPOF + manual-deploy risk (~30k–60k DAU)
**Symptom:** a box outage now hits real revenue/SEO; Redis is single-instance; and the **worker image is hand-built on the box** (`pull_policy: never`), so it silently drifts from the repo — operationally dangerous at this scale.
**Fix:** decompose the box — **Redis → Upstash** (managed/HA, already reachable via the `rediss://` pattern), **Typesense → Cloud or 2-node HA**, **worker → ≥2 instances** (BullMQ scales consumers horizontally; `WORKER_CONCURRENCY` is already parameterized), and **automate the worker deploy** to kill the drift.
**Exposes:** search + write-throughput scaling → #7.

### 7 — Search tier + write/aggregation throughput (~50k–80k DAU)
**Symptom:** search/faceting QPS grows; submission bursts spike the `search-index` and `aggregation` jobs; materialized-view refresh contends.
**Fix:** scale Typesense horizontally (cluster / Cloud tier), raise worker concurrency + instance count, **batch/debounce aggregation refreshes**, and add **rate limiting** on submit + search endpoints to protect the backends.
**Exposes:** global read latency + observability → #8.

### 8 — Tail latency, cache hit-rate, observability at scale (~80k–100k DAU)
**Symptom:** ~1M+ pageviews/day, hundreds of req/s peak, global audience; tail latency and cache hit-rate now govern SEO/CWV, and you can't fix what you can't see.
**Fix:** aggressive CDN/edge caching with stale-while-revalidate tuning; move the hottest reads to **edge runtime** (the [`getDb()`](../packages/db/src/index.ts) comment already anticipates the swap to `drizzle-orm/neon-serverless`); in-region read replicas; full metrics/alerting (Sentry performance + DB + **queue-depth dashboards**); explicit autoscaling headroom.

## Why the order holds

It's driven by the workload shape, not guesswork:

1. **Free-tier policy/cold-start** bites before any technical limit.
2. **Uncached reads** are next because the product is read-heavy SEO and nothing is cached yet.
3. **The shared box** is the first *infrastructure* ceiling — it's the only always-on, fixed-size component.
4. **Postgres primary** follows once caching has wrung out the easy reads.
5. **Clerk** lands later precisely because auth users are a *fraction* of DAU.
6–8. **SPOF removal → search/write scaling → global tuning** are the "now it's a real business" hardening steps.

## What never needs touching in this range

- **The data model** — the report → rounds → questions → topics hierarchy and the wedge index `reports_company_role_level_idx` scale fine; the index is guarded by `packages/db/tests/query-plan.test.ts`.
- **The async write path** — BullMQ already absorbs write spikes by design.
- **The `getDb()` chokepoint** — its single-point design is exactly what makes rungs 1, 4, and 8 cheap one-place changes rather than rewrites.

## One out-of-order note

Most rungs are capacity-triggered, but the **manual worker deploy** (rung 6) is a *latent operational* risk, not a capacity one — it doesn't break at a DAU number, it bites whenever you ship under pressure. Worth automating earlier than its slot suggests.
