---
status: accepted
date: 2026-06-05
deciders: [pujan]
---

# ADR-0006 — Canonical browse URL contract + slug→entity resolver

> **Partially superseded by [ADR-0009](0009-role-primary-browse-grain.md).** The
> URL shape, the path-builder/resolver split, and the 404/dual-audience rules
> below all stand. What ADR-0009 changes: the **canonical aggregated unit** is
> now `/companies/:company/:role` (the role page), not the
> `…/:level` wedge page. The level page became a secondary, conditionally-
> canonical *view* of the role page. Read "the canonical wedge page" below as
> "a level view" accordingly.

## Context

Sprint 4 turns the aggregation pipeline into the pages Google indexes: a
four-level browse hierarchy plus a public report detail page.

```
/companies
/companies/:company
/companies/:company/:role
/companies/:company/:role/:level     ← the canonical wedge page
/reports/:id
```

Two constraints make the URL shape non-trivial:

1. **Per-company level slugs.** Levels are meaningless across companies — Amazon
   "SDE II", Google "L4", Meta "E4". The level segment is therefore a
   *company-scoped* slug (`company_levels.slug`, unique only within a company),
   not a global one. Sprint 4's risk table flags this as the main routing
   complexity and asks for "one canonical-resolver function … all routes call
   through it."
2. **The wedge cell is keyed on the level's display name, not its slug.** The
   aggregate table (`aggregates_company_role_level`) and
   `interview_reports.level` store the text display name ("L4"), because the
   text column is the wedge index (ADR for aggregation is still owed; see
   below). So resolving a URL must translate `slug → company_levels row →
   display name` before reading the aggregate or the report list.

This ADR fixes the URL contract and where the resolver lives, so every link,
redirect, and route shares one definition instead of hand-rolling path strings
and slug lookups.

## Decision

**Path builders are pure and live in `@fromtheloop/shared`
(`src/url.ts`); the db-backed slug→entity resolver lives in
`@fromtheloop/core` (`src/url/resolve.ts`). All four `/companies/*` routes
resolve through `core`; all links build through `shared`.**

- `shared` exposes `companiesPath / companyPath / companyRolePath / wedgePath /
  reportPath` — pure string construction, URL-encoded, no DB. They live in
  `shared` (not `core`) because `lib/routes` and client components import them
  and must not pull in the db/postgres dependency the resolver carries.
- `core` exposes `resolveCompany / resolveCompanyRole / resolveWedge`, which
  compose the active-only db slug lookups (`getCompanyBySlug / getRoleBySlug /
  getCompanyLevelBySlug` in `@fromtheloop/db`'s `browse.ts`), fail fast (return
  `null` → the route `notFound()`s) at the first missing/inactive segment, and —
  for the wedge — hand back the `AggregateCellKey` keyed on the level **display
  name**.
- **Exact slug match, no normalization.** A non-canonical path (e.g. uppercased)
  resolves to `null` → 404, rather than rendering duplicate content at a second
  URL. Slugs are stored already-normalized by the curated seed + suggest-pending
  path.
- **Empty cells are not pages.** The rollup reads exclude `(company/role/level)`
  with zero visible reports (`HAVING COUNT > 0`); a custom level whose text has
  no `company_levels` slug renders in the ladder *without* a link (it has no
  canonical URL).
- **`/reports/:id` is dual-audience.** Public visitors read `active` reports
  (visibility filter identical to the aggregate/search pipelines); the author
  additionally reads their own report in any status (the post-submit landing for
  a `pending_moderation` row) and gets the 24h edit / soft-delete controls. A
  guessed/foreign id, or a non-public report viewed by a non-owner, 404s.

### ADR numbering note

Sprint 4's plan body refers to this as "ADR-0004", but `0003` (i18n URL
contract) and `0004` (validation + soft-delete) were already taken. The ADR
README had pre-allocated **0005 = aggregation strategy** (Sprint 3) and **0006 =
URL contract** (Sprint 4), so this ADR is **0006**, matching that plan. The
Sprint 3 aggregation-strategy ADR (the table-not-matview decision, its Day 10
deliverable) was never written and is **still owed** under the reserved
**0005**. This note records the drift so it isn't rediscovered later.

## Alternatives considered

| Option | Why not |
|---|---|
| Path builders in `core` alongside the resolver | `core` imports `@fromtheloop/db` (postgres); importing it into `lib/routes` / client components would bundle the db driver client-side. `shared` is pure. |
| Global level slugs (`/l4` meaning the same everywhere) | Levels don't mean the same thing across companies; a global slug would collide (every company has an "L4"-ish rung) and mislead. |
| Key the wedge cell on the level slug | The aggregate table + report rows are keyed on the text display name (the wedge index). Re-keying on slug would mean a schema migration mid-sprint for no gain. |
| Lowercase-normalize incoming slugs + render | Renders the same content at `/Stripe` and `/stripe` → duplicate-content SEO penalty. A 301 redirect to canonical is the right fix, deferred (not needed while every internal link is canonical). |

## Consequences

### Positive
- One URL contract: a path change is one edit in `shared`; the resolver is the
  single slug→entity authority. Routes are thin (resolve → `notFound()` or
  render).
- Client-safe: `lib/routes` and any client component can build canonical hrefs
  without dragging in the db driver.
- 404 correctness is centralized and tested (core `url.test.ts` + db
  `browse.test.ts`): inactive/pending taxonomy, unknown slugs, and wrong-company
  level slugs all resolve to `null`.

### Negative
- `generateMetadata` + the page body each call the resolver → a duplicate slug
  lookup per request. Cheap (indexed unique lookups) but not free; a
  `React.cache()` wrapper is the obvious later optimization.
- No casing/redirect tolerance yet: a mis-cased shared link 404s instead of
  redirecting. Acceptable while all internal links are canonical.

### Neutral / open
- ISR for the no-filter canonical wedge URL vs. SSR for filtered variants is
  **not** decided here — that rides with the Day 5 filter work (filters in URL
  query params) and will be its own note/ADR.
- The Sprint 3 aggregation-strategy ADR remains owed.

## References

- [sprints/sprint-04-wedge-page.md](../../sprints/sprint-04-wedge-page.md) — risk table (routing complexity), deliverables.
- [sprints/sprint-04-wedge-wireframe.md](../../sprints/sprint-04-wedge-wireframe.md) — the wedge layout the routes render into.
- [ADR-0003](0003-i18n-url-contract.md), [ADR-0004](0004-validation-and-soft-delete.md) — the ADRs already holding 0003/0004.
- `packages/shared/src/url.ts` (path builders + filter URL contract); `packages/core/src/url/resolve.ts` (resolver); `packages/db/src/browse.ts` (slug lookups + rollup reads).
