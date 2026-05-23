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
