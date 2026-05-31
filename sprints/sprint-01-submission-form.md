# Sprint 1 — Submission Form & Taxonomy

> **Weeks 3–4**

## Goal

A signed-in user can fill out the core (non-round) fields of an interview report — company, role, level, outcome — backed by taxonomy autocomplete and saved as a server-side draft.

## Why now

The submission flow is the **only data-creation surface** in V1. Everything else (aggregation, search, profiles) is read-side. Until users can submit, nothing else has data to work on. The taxonomy autocomplete pattern is wedge-critical (see PLAN.md §Taxonomy curation), so we burn it down first.

## In scope

- Submission route at `/submit` — single-page form, RSC + server actions
- Draft persistence: server-side, debounced, keyed by `user_id + draft_id`
- Resume draft from `/drafts/[draft-id]`
- Top-level fields:
  - Company (fuzzy autocomplete + "suggest new → pending")
  - Canonical role (autocomplete-only, no inline create)
  - Level (per-company enum; falls back to "N/A" if company has none yet)
  - Outcome (optional radio: offer / reject / withdrew / ghosted / pending)
  - Date (defaults to current month/year)
  - Display attribution toggle (`display_name` / `anonymous`)
- Taxonomy backing tables: `companies`, `canonical_roles`, `company_levels` with `status` column (`active | pending`)
- Seed data: 30 top tech companies, ~20 canonical roles (SWE, ML, data, SRE, etc.), levels per company — all `source = 'seed_curated'`
- Zod validators in `packages/shared`
- next-intl wired in (English-only content, but routing + key extraction working)
- Anti-abuse: honeypot field + Clerk captcha on first submission

## Out of scope

- Rounds, questions, tag input (Sprint 2)
- Validation rules between rounds (Sprint 2)
- Submission *completion* — this sprint ends with a "Continue → Rounds" CTA that goes to a stub
- Trust badges / evidence upload (Sprint 2 / 3)
- Edit window logic (Sprint 2)

## Deliverables

| Artifact | Where |
|---|---|
| `/submit` page with top-level fields + autocomplete | `apps/web/app/submit/` |
| `/drafts/[id]` resume page | `apps/web/app/drafts/[id]/` |
| Drizzle/Prisma migrations for companies, roles, levels, drafts, reports (stubbed) | `packages/db/migrations/` |
| `packages/core/taxonomy/` — search + suggest-pending logic | repo |
| `pnpm db:seed` produces 30 companies × roles × levels | local + dev DB |
| Component library starter — at minimum `Combobox` with fuzzy match | `apps/web/components/ui/` |

## Exit criteria

- [ ] Logged-in user can complete top-level form and click "Continue → Rounds" (which goes to a placeholder)
- [ ] Form auto-saves every change as a draft within ≤2s of last keystroke
- [ ] Refreshing the page restores the draft
- [ ] Typing "stri" suggests "Stripe" (curated) within 150ms p95
- [ ] Typing "MyTinyCo" with no match offers "Suggest new company"; submission creates `companies.status = 'pending'`
- [ ] Role autocomplete has NO "create new" affordance — only suggest existing matches
- [ ] Honeypot + captcha verified to actually reject (test with Playwright or manually)
- [ ] All form copy lives in `next-intl` message catalogs (no inline strings)

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Taxonomy autocomplete UX feels sluggish on first try | Server-side fuzzy match via Postgres `pg_trgm` for V1 — Typesense for taxonomy is overkill. p95 budget 150ms; measure with Sentry transactions. |
| Drafts grow unbounded (abandoned forms) | Soft cap: 10 drafts per user; oldest auto-pruned after 30 days. Implement in Sprint 1, schedule the cron in Sprint 6 with admin tooling. |
| next-intl introduces routing overhead we don't want yet | Run with default-locale-no-prefix mode; document the URL contract in ADR. |

## Dependencies

- Sprint 0 exit criteria met (auth + DB + deploy pipeline working)

## Day-by-day skeleton

| Day | Focus |
|---|---|
| 1 | Schema: companies, roles, levels, drafts, reports (top-level cols only). Migrations + seed scaffolding. |
| 2 | Seed data: 30 companies + 20 roles + per-company levels. `packages/db/seed/curated.ts`. |
| 3 | Taxonomy lookup endpoints + `pg_trgm` index; benchmark p95. |
| 4 | `<Combobox>` component with fuzzy match + "suggest new" affordance. |
| 5 | `/submit` route, top-level form fields, Zod validation, RSC shell. |
| 6 | Draft persistence (server action, debounced), `/drafts/[id]` resume. |
| 7 | next-intl wiring; move strings to messages catalog. |
| 8 | Honeypot + captcha; test rejection paths. |
| 9 | E2E test: login → fill → leave → return → resume → continue. |
| 10 | Buffer; exit-criteria walkthrough; write Sprint 2 prep notes. |

## Notes & decisions

_Append-only._

- 2026-05-31: Day 3 — **taxonomy lookup + pg_trgm landed** (`0002_trgm_taxonomy_indexes.sql`, `src/taxonomy.ts`, `apps/web/app/api/taxonomy/{companies,roles}/route.ts`). Query helpers `searchCompanies` / `searchRoles` (trigram-ranked, `status = 'active'` only) + `suggestCompany` (inserts `status = 'pending'`, `source = 'user_suggested'`, idempotent on slug, **never** flips an existing active row back to pending). **Match strategy:** hybrid fuzzy + substring — `name % q` (trigram, catches typos like `googel`→Google) OR `name ILIKE %q%` (substring) OR the same two over aliases (so `Facebook`→Meta, `SDET`→QA Engineer); ranked by `GREATEST(similarity(name,q), similarity(aliases,q))`, then `name ASC`. Both operators ride `gin_trgm_ops` indexes. **Path/placement decision:** the doc said `packages/core/taxonomy/`; put it in `packages/db/src/taxonomy.ts` instead — these are pure query helpers that share the db testcontainer harness + seed, and `core` depends on `db` (not vice-versa), so housing them in `db` avoids a dep cycle and a duplicate test rig. `core` stays empty until it has real domain policy to hold. Same documented-deviation pattern as Day 2's seed path. **pg_trgm-on-array gotcha (the real Day-3 cost):** `array_to_string()` is only STABLE, so Postgres rejects it in an index expression (`42P17: functions in index expression must be marked IMMUTABLE`). Wrapped it in an IMMUTABLE SQL fn `taxonomy_aliases_text(text[])` (deterministic for `text[]` + constant delimiter — the standard pattern) and the search queries call that same fn so the planner can match the expression to `companies_aliases_trgm_idx` / `roles_aliases_trgm_idx`. **Migration mechanics:** extension + fn + 4 GIN indexes are NOT in the Drizzle schema (drizzle-kit can't model `CREATE EXTENSION`/`FUNCTION` or expression indexes); scaffolded via `drizzle-kit generate --custom` so the journal entry + snapshot stay consistent, asserted against the pg catalog (`pg_extension`, `pg_indexes`) in `migration.test.ts` rather than the schema snapshot. drizzle-kit diffs schema↔snapshot (never the live DB), so it won't drop them. **Benchmark:** `EXPLAIN ANALYZE` on the dev DB (seqscan off) → 0.37ms exec for `stri`; p95 test runs the lookup ×50 and asserts < 150ms (exit criterion). Note: at the seeded 30 rows the planner picks `companies_status_idx` + filter, not the trgm index (correctly — GIN wins only as the table grows), so a forced query-plan assertion would be wrong at this scale; timing + index-existence are the right guards. Endpoints are Clerk-auth-gated (401 when signed out), Node runtime (postgres.js); companies endpoint returns `{ matches, canSuggestNew }` (canSuggestNew = non-empty query with 0 active matches → offer "suggest new"), roles returns `{ matches }` only (no inline create, closed canonical set). Also refactored `slugify` out to `src/slug.ts` (shared by seed + suggest). Tests: 43 → 58 (new `tests/taxonomy.test.ts` + pg_trgm/index assertions in `migration.test.ts`); `pnpm --filter @fromtheloop/db typecheck && test` green (58/58, stable ×2, ~2.2s), web typecheck green, migrate + seed re-run clean on dev DB (companies 30, levels 129, roles 20).
- 2026-05-30: Day 2 — **curated seed landed** (`src/seed/curated.ts`). 30 companies (each with `domain` + alias set + an ordered per-company level ladder) and 20 canonical roles, all `source = 'seed_curated'`, `status = 'active'`. Exported as plain `CURATED_COMPANIES` / `CURATED_ROLES` arrays so tests + future tooling import the canonical set without a DB round-trip. `seedCurated(db)` upserts via `onConflictDoUpdate` on the natural keys (company slug, role slug, `(company_id, level slug)`) so re-runs refresh edits in place — idempotent without DELETE. Level slugs derive from display name via a local `slugify` (unique within a company, all the `(company_id, slug)` constraint needs); `order_index` = array position since ladders don't sort lexically (L3<L4<L5, E3<E4…). Rewired `src/seed/index.ts` (the `pnpm db:seed` entrypoint) to call it, dropping the Sprint-0 `fromtheloop` placeholder. **Path note:** the doc said `packages/db/seed/curated.ts`; actual home is `packages/db/src/seed/` to match the existing layout + the `seed` script. Tests: 37 → 43 (new `tests/seed.test.ts`: taxonomy size 30/20, slug uniqueness, every company active+seed_curated with stripe domain check, every role active+seed_curated, every company ≥1 level with dense 0-based `order_index`, idempotency across a triple run). **Two test gotchas, both from the shared testcontainer:** (1) the seed test must NOT `truncateAll` in `beforeAll` — TRUNCATE takes an exclusive lock and blocks behind other suites' lingering connections (hangs to the hook timeout); isolation comes from source-filtering (`where source = 'seed_curated'`) instead. (2) The seed leaves rows in the shared DB, so it must clean them up in `afterAll` (DELETE by source — row locks, not TRUNCATE), otherwise `constraints.test`'s own `swe` role insert hits `roles_slug_uq` depending on file order. With `fileParallelism: false`, afterAll cleanup runs before the next file, making it deterministic. `pnpm --filter @fromtheloop/db typecheck && test` green (43/43, stable across 3 consecutive runs, ~2.4s). Also ran `pnpm db:seed` end-to-end against the dev DB (root `.env.local` `DATABASE_URL`) → exit 0, idempotent on repeat.
- 2026-05-29: Day 1 — **taxonomy/draft schema landed** (`0001_giant_nightcrawler.sql`). Two new pgEnums (`taxonomy_status` = active|pending|merged, `taxonomy_source` = seed_curated|user_suggested); two new tables (`company_levels` — per-company ladder with `(company_id, slug)` unique + cascade-from-company; `submission_drafts` — jsonb `data`, cascade-from-user, `updated_at` for the ≤2s auto-save + 30-day TTL). Extended `companies` (aliases text[], domain, status, source, suggested_by_user_id→users SET NULL) and `roles` (aliases, status, source, merged_into_id self-FK SET NULL). Added `interview_reports.level_id` (nullable FK → company_levels, RESTRICT). **Naming decision:** kept the existing `roles` table rather than renaming to `canonical_roles` as the doc says — the wedge index + reports FK + 20 tests already reference `roles`; "canonical" lives in the FK column name + the no-inline-create rule, documented in `taxonomy.ts`. **Level migration decision:** added `level_id` *alongside* the existing text `level` (kept NOT NULL) rather than cutting over — the wedge index `reports_company_role_level_idx` is built on text `level` and asserted by `query-plan.test.ts`, and no reports are written this sprint (submission ends at the Rounds stub), so the text→FK cutover is deferred to Sprint 2 when reports first persist. Tests: 20 → 37 (added company_levels FK/cascade/unique + same-slug-across-companies, drafts FK/cascade/jsonb round-trip, SET-NULL on both self/suggested FKs, aliases default; new migration-shape table+index assertions; type-level unions for the new enums + nullability of level_id/domain/merged_into_id/draft.data). `pnpm --filter @fromtheloop/db typecheck && test` green (37/37, ~2.4s); migration applied + idempotent seed still runs locally.
