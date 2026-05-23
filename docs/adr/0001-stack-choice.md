---
status: accepted
date: 2026-05-23
deciders: [pujan]
---

# ADR-0001 — Stack choice: Next.js, Neon, Typesense, Hetzner

## Context

Solo developer building **FromTheLoop**, an interview-prep wedge product positioned against Glassdoor (see [PLAN.md](../../PLAN.md)). Constraints:

- **Cost**: must run at near-zero spend until alpha proves the wedge. Target ≤$10/mo at alpha.
- **Time**: 16 weeks solo (8 × 2-week sprints) to first usable release.
- **SEO is the growth model**: programmatic SEO at `~/companies/[company]/[role]/[level]` is the V2 compounding workhorse, so the stack must support SSR/SSG natively and serve Core Web Vitals well from day 1.
- **Read/write split**: aggregation is read-heavy and tolerates seconds-to-minutes of lag. Submissions are write-light. Search must be faceted (round-type × tags × outcome × trust-tier).
- **i18n-ready** without paying the i18n complexity tax in V1.
- **Operator experience matters**: I'm the only ops person, so anything I pick has to be debuggable at 2am on a phone.

Decision needs to be locked before Sprint 0 starts because every later sprint assumes specific tools.

## Decision

The V1 stack is:

| Layer | Choice |
|---|---|
| Frontend + SSR | **Next.js 15 App Router** on **Vercel** (free tier) |
| Backend logic | Next.js route handlers + server actions (modular monolith) |
| Primary DB | **Neon Postgres** (free tier, branches for dev/staging/prod) |
| Background worker | Node + **BullMQ** on **Hetzner CX22** (~€5/mo, Docker) |
| Search + facets | **Typesense** (self-hosted on same Hetzner box) |
| Cache + queue broker | **Redis** (self-hosted on same Hetzner box) |
| Auth | **Clerk** (free tier) |
| Object storage | **Cloudflare R2** (free tier) |
| Transactional email | **Resend** (free tier) |
| Error tracking | **Sentry** (free tier) |
| Event bus (internal) | Postgres `events` table + `LISTEN/NOTIFY` |
| Aggregation strategy | Hybrid: Postgres materialized views (canonical aggregates) + Typesense facets (dynamic filters) |

Total recurring infra spend at alpha: **~$5/mo** (one Hetzner box; everything else free tier).

## Alternatives considered

| Option | Why not |
|---|---|
| **Remix / SvelteKit / Astro** instead of Next.js | Next.js + Vercel has the smoothest SSR-for-SEO story and is the path of least resistance for App Router conventions, RSC, and ISR. Astro was tempting for content-heavy SEO but loses on the interactive submission flow. |
| **Supabase** instead of Neon + Clerk | Supabase is two services in one, but Clerk's auth UX + anti-abuse signals are better, and Neon's branching gives me Git-like DB workflows that pay off all sprint long. Splitting them is the right trade. |
| **Algolia** instead of Typesense | Algolia free tier is too small for programmatic SEO scale; pricing climbs sharply. Typesense self-hosted gives unlimited records on a $5 box. |
| **Meilisearch** instead of Typesense | Close call. Typesense's faceting + typo tolerance + curation API better match the wedge (round-type × outcome × tags faceting). Meilisearch is fine but Typesense wins on day-one fit. |
| **Postgres full-text only** (no separate search) | Workable for V1 reads, but the wedge depends on facets across high-cardinality tag combinations. Postgres FTS + custom aggregation indexes would be more code than running Typesense. |
| **Render / Fly / Railway** instead of Hetzner | All are >$5/mo for equivalent box, and pricing is opaque. Hetzner CX22 is a known quantity. The cost of "I have to ssh in" is acceptable solo. |
| **Cloudflare Workers + D1** end-to-end | Tempting for cost, but D1 limits + worker runtime constraints would force compromises on the aggregation pipeline. Revisit at V2 if cost pressure appears. |
| **Pure serverless (no Hetzner box)** | Background workers + Typesense + Redis on serverless gets expensive and brittle. One $5 box is simpler. |
| **Managed Typesense Cloud** | Free tier is too small; paid is overkill for V1. Self-host wins; fallback documented (Sprint 0 risk table). |
| **Microservices from day 1** | Premature. Modular monolith with event-driven internals gives the same separation in code without the ops cost. ADR will be written if we ever split out. |

## Consequences

### Positive
- **Cheap**: ~$5/mo lets the project survive a long alpha without funding pressure.
- **SEO-native**: Next.js 15 App Router + SSR/SSG + ISR matches the programmatic-SEO requirement perfectly.
- **Single box** for Typesense + Redis + worker keeps ops trivial — one Hetzner instance to monitor, one Docker compose to reason about.
- **Branchable database** (Neon) means dev/staging/prod ergonomics are first-class without paying for multiple instances.
- **Auth offloaded** to Clerk — no rolling auth, no password hashing, no abuse heuristics from scratch.
- **Event-driven monolith via LISTEN/NOTIFY** keeps the system loosely coupled without service boundaries.

### Negative
- **Hetzner is a single point of failure.** If the box dies, search + worker are down even if Vercel + Neon are up. Mitigated by: Sprint 7 daily backup; Hetzner snapshot before risky changes; documented bootstrap runbook so re-provisioning takes <1 hour.
- **Two languages of "where data lives"**: Postgres for truth, Typesense for query. Drift is possible. Sprint 3 includes a reconciliation worker; Sprint 6 admin tool surfaces drift.
- **Aggregation lag** (seconds to minutes) — explicitly accepted in PLAN.md. UI must not pretend aggregates are realtime.
- **Vercel + Clerk free-tier ceilings** become migration risk if growth is sudden. Tracked: monitor MAU on Clerk and bandwidth on Vercel monthly.
- **Self-hosted Typesense + Redis** = I patch them. Bounded by `docker compose pull` discipline; runbook in Sprint 0.

### Neutral / open
- **Drizzle vs Prisma**: not decided in this ADR. Sprint 0 picks; defaulting toward Drizzle for lighter weight and better edge support, but Prisma's tooling is mature. Whichever wins gets its own short ADR.
- **Server actions vs route handlers** balance: starting RSC + route handlers; reaching for server actions only when proven needed. Re-evaluate end of Sprint 2.
- **Whether to ever leave Hetzner for the worker tier**: revisit at V2 when load is observed.

## References

- [PLAN.md §Architecture & stack](../../PLAN.md#architecture--stack)
- [PLAN.md §V1 scope](../../PLAN.md#v1-scope)
- [Sprint 0 plan](../../sprints/sprint-00-scaffolding.md) — this is what implements the decision
- Neon free tier: <https://neon.tech/docs/introduction/pricing>
- Typesense self-host docs: <https://typesense.org/docs/guide/install-typesense.html>
- Hetzner CX22 specs: <https://www.hetzner.com/cloud>
