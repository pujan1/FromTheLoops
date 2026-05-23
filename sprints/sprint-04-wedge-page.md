# Sprint 4 — Canonical Wedge Page + Search UI

> **Weeks 9–10**

## Goal

The `/companies/[company]/[role]/[level]` page renders aggregated insights (Position Y) + report list (Position X), and the site has a working search bar with filters. This is the wedge — when this ships, the V1 thesis is testable.

## Why now

Sprints 1–3 produced data and pipelines. Sprint 4 turns them into the page Google indexes and users land on. Nothing else in V1 matters as much.

## In scope

- `/companies/[company]/[role]/[level]` page — fully SSR/SSG, no CSR fallback
  - Top: Position Y aggregated insights (counts, outcome distribution, top tags, common round structure, trust-weighted signals)
  - Below: Position X report list (paginated, filterable by round-type / outcome / tags / trust-tier)
  - Right rail: "Salary range coming soon — submit yours" CTA placeholder
  - Sparse-data banner when fallback scope ≠ `'exact'`
- `/companies` index, `/companies/[company]`, `/companies/[company]/[role]` rollup pages
- `/reports/[id]` individual report detail page
- Global search bar in header — fires Typesense query, returns results page
- `/search?q=...` results page (`noindex`)
- Filters in URL query params (`?round=onsite-coding&outcome=offer`); page reflects filter state on SSR
- Per-company level slugs in URLs (`amazon/sde2`, `google/l4`, `meta/e4`) — handled by the level taxonomy
- `next/image` for any media; Core Web Vitals discipline (LCP <2.5s on the wedge page)
- Visual design pass — run `/frontend-design` skill against wireframe of the wedge page; commit the resulting components

## Out of scope

- `/topics` browse (Sprint 5)
- Profiles + karma (Sprint 5)
- Admin tooling (Sprint 6)
- sitemap.xml + JSON-LD (Sprint 7 — alongside legal/polish)
- Personalization / recommendations

## Deliverables

| Artifact | Where |
|---|---|
| All four `/companies/...` route levels + `/reports/[id]` | `apps/web/app/companies/`, `apps/web/app/reports/` |
| Search bar + `/search` page | `apps/web/app/search/`, header component |
| Filter state ↔ URL query params (typed, parsed via Zod) | `packages/shared/url/` |
| Position Y aggregate UI components | `apps/web/components/aggregate/` |
| Position X report list w/ pagination + trust-tier filter | `apps/web/components/reports/` |
| Sparse-data banner component | `apps/web/components/sparse-banner.tsx` |
| Lighthouse / CWV baseline report committed | `docs/perf/sprint-04-baseline.md` |

## Exit criteria

- [ ] `/companies/stripe/backend-engineer/l4` renders with seed + dummy data; no client-side data fetch
- [ ] Position Y shows count, outcome distribution, top 5 tags, common round structure
- [ ] Position X paginates 20 reports/page, filter chips work, URL updates as filters change
- [ ] Search "stripe coding" returns relevant reports in <300ms p95
- [ ] Sparse-data banner appears when fewer than 10 reports match; fallback scope reflected in copy
- [ ] LCP on canonical wedge page <2.5s, INP <200ms on a throttled mobile profile (Lighthouse)
- [ ] All four `/companies/...` levels render meaningful content; not 404 placeholders
- [ ] Visual quality bar: design pass complete, no obvious AI-generic look (per `/frontend-design` skill output)

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Per-company level slugs make routing complex (`l4` vs `sde2` vs `e4`) | One canonical-resolver function in `packages/core/url/`; all routes call through it. Document URL contract in ADR-0004. |
| SSR + filter query params blow up cache strategy | ISR for the base canonical URL (no filters); SSR for filtered variants with short cache headers; documented in ADR. |
| Visual design takes longer than expected | Time-box `/frontend-design` to 3 days; ship a B-tier visual baseline; iterate in Sprint 7 polish. |

## Dependencies

- Sprint 3 exit criteria — matviews + Typesense populated
- Real-ish seed data (≥50 reports across 5 companies, ≥3 levels) — produce during day 1 of this sprint if Sprint 2's seed wasn't enough

## Day-by-day skeleton

| Day | Focus |
|---|---|
| 1 | Beef up seed data; wireframe the wedge page on paper |
| 2 | Routing: all four `/companies/...` levels, canonical URL resolver, `/reports/[id]` |
| 3 | Position Y aggregate components from matview data |
| 4 | Position X report list + pagination |
| 5 | Filter state ↔ URL query params; SSR with filters |
| 6 | Search bar + `/search` results page |
| 7 | Sparse-data banner; rollup pages (`/companies`, `/companies/[company]`, `/companies/[company]/[role]`) |
| 8 | `/frontend-design` pass; component polish |
| 9 | Performance pass: LCP, INP, CLS budgets met |
| 10 | E2E test of the wedge journey; ADR-0004; exit criteria |

## Notes & decisions

_Append-only._
