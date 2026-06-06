---
status: accepted
date: 2026-06-06
deciders: [pujan]
---

# ADR-0009 — Role-primary browse grain (level demoted to a filter)

> Partially supersedes [ADR-0006](0006-browse-url-contract.md): the URL *shape*
> and the resolver stand; what changes is which tier is the **canonical
> aggregated unit**. ADR-0006 made `/companies/:company/:role/:level` "the
> canonical wedge page." This ADR moves that role to `/companies/:company/:role`.

## Context

Sprint 4 shipped the level cell `(company, role, level)` as the primary
aggregated unit. Two facts from early use + market analysis make that the wrong
grain:

1. **Level data is unreliable.** The submit form makes level optional and leads
   with a "skip" option; a skipped level resolves to a sentinel
   (`UNSPECIFIED_LEVEL`, null FK). Many submissions skip it. Aggregating on a
   field most users leave blank produces thin, misleading cells — and a
   skipped-level report had **no reachable page at all** (the sentinel has no
   `company_levels` slug → no wedge URL; it showed only as a dead rung).
2. **Leveled reports fragment.** Splitting a role's reports across L3/L4/L5 cells
   means most cells sit below the sparse threshold, so the wedge page was a wall
   of sparse banners even when the *role* had plenty of data.

The desired behavior: a visitor lands on a company or role and **sees
everything** — recent reports regardless of role/level — with level as an
optional refinement, not a required drill-down.

## Decision

**The `(company, role)` pair is the primary aggregated unit. Level is demoted to
an optional filter facet. The three browse tiers become:**

| Route | Role | Aggregation |
|---|---|---|
| `/companies/:company` | All-roles recent feed + role nav + outcome filter | none (mixing roles is noise) |
| `/companies/:company/:role` | **The money page** | Position Y = role aggregate over **all** levels (incl. Unspecified) |
| `/companies/:company/:role/:level` | A per-level *view* of the role page | Position Y swaps to the level cell, conditionally |

Mechanics:

- **New role-grain aggregate.** `aggregates_company_role` table +
  `refresh_aggregate_role()` SQL fn (migration 0011), recomputed from base rows
  — mirrors `aggregates_company_role_level` minus the level axis, reuses
  `report_trust_weight()` and the same visibility filter. A report write
  refreshes **both** its level cell and its role cell (the event outbox handler
  now calls both); `refresh_all_aggregates()` drives the role backfill too.
- **Level view = role page with `?level=` pre-applied.** The `/[level]` path and
  the `?level=<slug>` query render the **same** `RoleView` body. Default Position
  Y is the role aggregate; an active level swaps it to that level's precomputed
  cell — **but only when the cell is dense** (`decideLevelView` ≥ threshold). A
  thin level falls back to the role aggregate with a sparse banner. One code
  path, both grains, all precomputed.
- **Conditional canonical (SEO).** `?level=` canonicalizes to the level *path*; a
  level path self-canonicalizes when dense, else canonicalizes **up** to the role
  page (a thin level page is a near-duplicate of the role page and shouldn't
  compete for index space). The path is strict (bad slug → 404); the query is
  tolerant (bad slug → whole-role view).
- **Honest "Unspecified."** The skip sentinel is renamed `N/A → "Unspecified"`
  (display + stored). We **do not** guess a level (e.g. "mid-level") — that would
  reintroduce the very inaccuracy this ADR fixes and pollute the level filter.
  Unspecified reports count in the role grain + feed and render as "Unspecified";
  `refresh_aggregate_cell()` **refuses the sentinel**, so they never form a
  phantom level cell.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep level primary, add a role rollup on top | Two canonical grains, two sparse thresholds, the thin-cell problem persists on the level pages users still land on from search. |
| Collapse level entirely (display-only metadata) | Throws away the real signal from dense, well-leveled cells (e.g. `google/swe/l4` with 20 reports) that *should* rank on the long-tail. |
| Derive the role aggregate by merging level cells at read time | Wrong for median/mode/top-topics (not mergeable from sub-aggregates) and misses Unspecified reports entirely. |
| Store skipped level as an assumed "mid-level" | Asserts a fact we don't have; pollutes the mid-level aggregate or makes the level filter inconsistent. |
| Force level required at submit | Fixes new blanks at the cost of submit friction, doesn't fix existing blanks, and contradicts "interviewed before the level was decided." |

## Consequences

### Positive
- A skipped-level report is always reachable + counted (role grain + company
  feed). No more dead rungs.
- The role page nearly always clears the sparse threshold, so Position Y reads as
  a confident signal; banners appear only on genuinely thin *level* views.
- Dense level pages still self-canonicalize → the long-tail SEO from ADR-0006 is
  preserved where it's earned.
- The level signal stays honest: a "Mid-level" filter means actually mid-level.

### Negative
- A second aggregate table + refresh path to keep in lockstep (mitigated: both
  refreshed in one outbox handler + one backfill; a drift test pins both SQL
  files to their `views/` source).
- `generateMetadata` does an extra `getAggregate` to decide the level-page
  canonical (cheap PK read; a `React.cache()` wrapper is the later fix, same note
  as ADR-0006).

### Neutral / open
- Position Y is **not** recomputed over the role scope for arbitrary filters —
  only the precomputed role + level cells are shown. Live per-filter aggregation
  stays out of scope.
- Filtering to *Unspecified-only* on the role page isn't wired yet (Unspecified
  reports are shown by default; a dedicated facet value is deferred).
- ADR-0005 (aggregation strategy, Sprint 3) remains owed and now also covers the
  role grain.

## References

- [ADR-0006](0006-browse-url-contract.md) — the URL contract this partially supersedes (shape + resolver unchanged).
- `packages/db/views/aggregates_company_role.sql` + migration `0011_*` — the role grain.
- `packages/core/src/aggregation/scope.ts` — `decideLevelView`.
- `apps/web/app/companies/_components/role-view.tsx` — the shared role/level body.
- [sprints/sprint-04-wedge-page.md](../../sprints/sprint-04-wedge-page.md) — Days 6–8 + the role-primary amendment note.
