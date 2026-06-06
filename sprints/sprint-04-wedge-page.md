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

- 2026-06-05: **Day 1 done** (seed data beefed up + wedge-page wireframe). db tests 118 → **123** (new `seed-reports.test.ts`, 5 cases); full repo typecheck clean. Verified live against the local docker stack: `pnpm db:seed:reports` wrote **152 active reports** across 20 cells, `refreshAllAggregates` produced 20 aggregate cells, `pnpm backfill:typesense` indexed 152 reports. Spot-checked the showcase cell `google/swe/L4` — 20 reports, outcome distribution 5 offer / 5 reject, trust-weighted 11.6, median 4 rounds, mode sequence len 3, 10 top topics. The wedge page now has real shapes to render.
  - **Why seed reports are needed at all.** Sprint 3 established that nothing flips a *real* report to `active` yet (Sprint 2 moderation holds user submissions at `pending_moderation` until the Sprint 6 mod queue), and aggregates + search only ingest `active` rows. So before this, live aggregates/search were **empty** and the wedge page would render nothing. The seed writes rows directly as `source='seed_dummy'`, `status='active'` to give Sprint 4 something to build on.
  - **Separate `seed:reports` script (not folded into `db:seed`).** `pnpm db:seed:reports` → `packages/db/src/seed/reports-run.ts`: ensures taxonomy (`seedCurated`, idempotent), generates reports (`seedReports`), then `refreshAllAggregates`. Keeps the pure-upsert taxonomy seed (`db:seed`) separate from the volatile report fixtures. **Does not touch Typesense** — the db package must not depend on the search package (search depends on db, not the reverse), so the runner reminds you to run `pnpm backfill:typesense` separately (needs the stack up).
  - **Mixed density by design** (`SEED_CELLS` in `seed/reports.ts`): 7 dense cells (≥10, clear the "exact" threshold → rich Position-Y), 5 medium (5–9, broaden to role scope), 8 sparse (1–4, exercise the fallback banner hard). 10 companies, many levels — clears the sprint's "≥50 reports / ≥5 companies / ≥3 levels" dependency floor with margin (152 / 10 / many).
  - **Deterministic + idempotent.** A fixed-seed mulberry32 PRNG drives every choice, so the same DB in → same fixtures out (the test asserts exact per-cell counts). `seedReports` deletes prior `seed_dummy` reports first (children CASCADE from rounds), and `refreshAllAggregates` recomputes wholesale — re-runs refresh rather than pile up. ~35% of reports are `evidence_verified` to exercise trust-weighting (verified spot-check: weighted 11.6 < count 20, so the 1.0/0.3 split is live). Outcome/attribution/round-count/topic choices are weighted for realism; offer outcomes skew to positive round ratings.
  - **Test cross-suite gotcha fixed.** `seed-reports.test.ts` seeds curated taxonomy; `reports.test.ts` raw-inserts a bare `swe` role expecting a clean slate (files run serially against a shared container, `fileParallelism: false`). The new test's `afterAll` now also deletes `source='seed_curated'` rows (mirroring `seed.test.ts`) so it leaves no leftover `swe` to collide with.
  - **Wireframe:** `sprints/sprint-04-wedge-wireframe.md` — ASCII desktop + mobile layouts, the data→component map, the four render states (exact / sparse / tag-floor / 404), all grounded in the **real** aggregate columns. Flags two open Day-2 items: the level-slug↔display-name resolver, and the **ADR numbering drift** (see below).
  - **⚠️ ADR numbering drift (carried over from Sprint 3, affects Sprint 4).** The Sprint 3 aggregation ADR (its Day 10 deliverable) was **never written**, and this Sprint 4 plan refers to the URL-contract ADR as "ADR-0004" — but `0003` is already i18n-url-contract and `0004` is validation-and-soft-delete. Both ADRs need **fresh numbers** (aggregation + URL-contract, likely `0005`/`0006`). Resolve when the URL resolver lands (Day 2) and at exit (Day 10).
  - **Deferred (rest of Sprint 4):** all routing + page work (Days 2–9), search UI (Day 6), filter↔URL (Day 5), CWV/perf baseline (Day 9), E2E + ADRs (Day 10).

- 2026-06-05: **Day 2 done** (all four `/companies/*` route levels + `/reports/[id]` public page + canonical URL resolver + ADR-0006). db tests 123 → **131** (new `browse.test.ts`, 8 cases); core tests 31 → **36** (new `url.test.ts`, 5 cases); full repo typecheck clean. Runtime-verified against the seeded local DB: all four levels SSR real content (`/companies` → `/companies/google` → `/companies/google/swe` → `/companies/google/swe/l4` showing 20 report cards + Position-Y aggregate summary), a bad level slug (`…/l99`) 404s, and a public `/reports/[id]` renders the full rounds→questions→topics tree with public attribution. No client-side data fetch (plain-curl HTML is fully populated).
  - **Canonical URL contract split across two packages (ADR-0006).** Pure path builders (`companyPath/companyRolePath/wedgePath/reportPath`) live in **`@fromtheloop/shared`** (`url.ts`, alongside the filter-URL contract) — client-safe, no db. The db-backed **resolver** (`resolveCompany/resolveCompanyRole/resolveWedge`) lives in **`@fromtheloop/core`** (`url/resolve.ts`) and composes active-only slug lookups, failing fast (→ `notFound()`) at the first missing segment. Builders went to `shared` (not `core`) specifically because `lib/routes` + client components import them and must not pull in core's db/postgres dependency. `lib/routes` now delegates the browse paths to the shared builders.
  - **The slug↔name translation that drives everything.** URLs carry the per-company level *slug* (`company_levels.slug` — `l4`, `sde-ii`, `e4`, unique only within a company), but the aggregate table + `interview_reports.level` are keyed on the level *display name* (`L4`). `resolveWedge` does `slug → company_levels row → display name` and hands the page an `AggregateCellKey` keyed on the name. Exact slug match, no case-normalization (a mis-cased path 404s rather than rendering duplicate content); a casing→canonical redirect is deferred.
  - **db reads** (`packages/db/src/browse.ts`): `getCompanyBySlug/getRoleBySlug/getCompanyLevelBySlug` (active-only primitives) + rollup count reads (`listCompaniesWithReports`, `listRolesForCompanyWithReports`, `listLevelsForCompanyRoleWithReports`) + `listReportsForCell` (paginated, window-total via `COUNT(*) OVER ()`). **Visibility filter is identical to the aggregate/search pipelines** (`status='active' AND deleted_at IS NULL`); `HAVING COUNT > 0` means an empty cell is never a linkable page, and a custom level whose text has no `company_levels` slug renders in the ladder **without** a link.
  - **`/reports/[id]` is now dual-audience.** Was owner-only (redirect to sign-in, ownership-scoped). New `getPublicReportDetail` (factored out of `getReportForEdit` — shared head→tree assembly) reads `active` reports for anyone; the page falls back to the ownership-scoped read for a signed-in author so they still see their own `pending_moderation`/`deleted` report (the **post-submit landing is preserved**) and keep the 24h edit / soft-delete controls. A guessed/foreign id, or a non-public report viewed by a non-owner, 404s. Renders the full rounds→questions→topics tree (reusing the existing `rounds.type`/`rounds.rating`/`submit.outcome` i18n + a new `report.detail.*` key set).
  - **⚠️ ADR numbering drift resolved.** The README had pre-allocated **0005 = aggregation strategy** (Sprint 3, the table-not-matview decision — **still owed/never written**) and **0006 = URL contract** (this sprint). So the URL-contract ADR is **ADR-0006**; **0005 stays reserved** for the owed Sprint 3 aggregation ADR. README index updated (0005 marked _owed_, 0006 accepted).
  - **Day-2 deliberately basic where Days 3–7 own the polish:** the wedge page renders a plain `FtlStatGroup` + round-sequence + topic chips + first-20 report cards — the *designed* Position-Y components (Day 3), pagination (Day 4), filters↔URL (Day 5), and the sparse-data banner (Day 7) are not built yet. No `generateStaticParams`/ISR config yet (rendering is dynamic via DB reads) — ISR-vs-SSR decision rides with the Day 5 filter work.
  - **Stale `.next` gotcha (not a code bug):** the dev server first 500'd with a missing `pages/_document.js` — a stale App-Router/Pages-Router cache artifact; `rm -rf apps/web/.next` + restart fixed it.

- 2026-06-05: **Days 3–5 done** (Position-Y aggregate components + Position-X report list/pagination + filter↔URL state, all SSR). db tests 131 → **133** (2 new `browse.test.ts` cases: per-report topics + the four filter facets); shared tests 30 → **32** (trust-tier parse/build); core unchanged (36); full repo typecheck clean. Runtime-verified against the seeded local stack on the showcase cell `google/swe/l4` (20 reports): base page renders all four Position-Y blocks + the filter bar + canonical link; `?outcome=offer` → 5, `?trust=verified` → 8, `?topics=arrays` → 16, `?outcome=offer&roundType=onsite-coding` → 5; `?perPage=5` paginates 1–5 / 6–10 / … with a working pager; a malformed `?outcome=bogus&page=abc&trust=platinum` degrades to all 20 (HTTP 200, no 500); dev log clean.
  - **Day 3 — Position Y is four composable server components** (`apps/web/components/aggregate/`, one shared `aggregate.module.css`): `OutcomeBars` (a stacked proportional bar + legend, `role="img"` with a spoken summary), `TrustSignal` (weighted-of-N + a one-line methodology note), `RoundStructure` (median + the `mode_round_sequence` as a numbered ladder), `TopTopics` (chips → `/topics/[slug]`). `AggregatePanel` composes them in wireframe order; **each child returns `null` when its slice is empty**, so a thin cell degrades gracefully without per-call guards. All read straight off the existing `CompanyRoleLevelAggregate` shape — no new db work for Position Y. **Position Y is unfiltered by design**: it's the precomputed insight for the whole cell; only Position X reacts to filters.
  - **Day 4 — Position X list + SSR pager** (`apps/web/components/reports/`): `ReportList` maps cell rows onto the existing `FtlReportCard` (now with real topic chips — see the db change); `Pagination` renders **plain `<a>` links** (first/last/current±1 with `…` gaps), so a page is a real crawlable URL and the control works with JS off. `listReportsForCell` now also returns each report's **distinct, name-sorted topics** via a `rounds→questions→question_topics→topics` subquery (`jsonb_agg`), filling the `topics={[]}` placeholder Day 2 left on the cards.
  - **Day 5 — filter state lives entirely in the URL.** The `reportFiltersSchema` (`packages/shared/url`) already had outcome/roundType/topics/sort/page/perPage; added a **`trust` tier facet** (`all`|`verified`, emitted only when non-default). `FilterBar` is a **server component of link-based chips** — each chip is an `<a>` to the same path with one facet toggled (and `page` reset to 1), so filtering is 100% SSR, shareable, and crawlable; the active topic filters render as **removable** chips. `listReportsForCell` gained an optional `filters` arg (outcome `=`, trust `evidence_verified`, round-type + topics as `EXISTS` sub-selects); the `COUNT(*) OVER ()` window total reflects the filters, so **pagination is over the filtered set**.
  - **Topic-filter SQL gotcha.** `t.slug = ANY(${jsArray}::text[])` failed at runtime — drizzle's `sql` template binds a JS array as a *scalar* param, which postgres rejects (`malformed array literal`). Switched to an `IN (…)` list built with `sql.join(slugs.map(s => sql\`${s}\`), sql\`, \`)` (one bound param per slug). Topic-facet semantics are **OR within the facet** (a report matches ANY selected topic) — friendlier on sparse data than AND.
  - **Canonical to the bare wedge URL.** `generateMetadata` now sets `alternates.canonical` to `routes.wedge(...)` (no query string), so every filter/page variant points the crawler at one indexable page rather than a combinatorial explosion of filter states. (Filtered variants aren't `noindex`'d — the canonical handles dedupe; revisit with the Sprint 7 SEO pass.)
  - **Centralized labels** (`apps/web/lib/labels.ts`): `OUTCOME_LABEL` / `ROUND_TYPE_LABEL` (+ `outcomeLabel`/`roundTypeLabel` fallbacks, `OUTCOME_BADGE` severity map), keyed on the shared enums so a new enum value is a compile error, not an unlabeled chip. Replaces the inline `OUTCOME_LABEL`/`humanizeRound` Day 2 left in the page. (Not wired to i18n — the wedge page stayed English-literal like Day 2; i18n-ifying the browse surface is its own task.)
  - **Drive-by fix:** the Day-2 browse + report-detail CSS referenced an **undefined `--color-line`** token (correct token is `--color-rule`) — every hairline border was falling back to `currentColor` (ink). Swept `--color-line)` → `--color-rule)` in `browse.module.css` + `reports/[id]/reports.module.css`.
  - **Deferred (still owed this sprint):** search bar + `/search` (Day 6); sparse-data banner + the `/companies` rollup index pages' design (Day 7) — the `decideScope()` fallback is wired in `@fromtheloop/core` but **not yet rendered** on the wedge page (Position Y still always shows the exact cell); `/frontend-design` pass (Day 8); CWV/perf baseline (Day 9); E2E + the two owed ADRs (0005 aggregation, Day 10). Pagination's `sort` is fixed to `recent` (helpful/relevant need karma/search, out of scope here).
