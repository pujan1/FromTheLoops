# FromTheLoop

Interview reports straight **from the loop** — by candidates, for candidates. V1 ships structured, taxonomy-aware interview reports for US tech engineering candidates so the right interview prep is one search away.

> Working directory is `company_reviews/` for historical reasons; the product, brand, and domain are **FromTheLoop**.

> **Source of truth for design decisions:** [PLAN.md](PLAN.md). This README is the operational entry point — what the project is, how to run it, how the code is laid out.

---

## Status

| | |
|---|---|
| Phase | Sprint 0 (scaffolding & infra) — in progress, ~Day 8/10 |
| Target alpha | ~16 weeks of solo dev (8 × 2-week sprints) |
| Infra cost at alpha | ~$5/mo |
| Repo state | Monorepo scaffolded (web + worker + db/search/core/shared); CI green; Vercel + Hetzner + Neon + Clerk live |

Active sprint plans live in [sprints/](sprints/).

---

## The wedge in one line

> Find the **right** interview report for what *you* are interviewing for — by company × role × level × round-type × topic — with trust signals attached.

Not "reviews of working at a company" (V2.5+). Not comp data (V2). Not job listings (V3).

---

## V1 scope (locked)

**In:**
- Structured interview report submission (per-round, per-question, tagged)
- Aggregated insights at `/companies/[company]/[role]/[level]` (programmatic SEO target)
- Question-first browse at `/topics/[topic]`
- Search with filters
- Company + user profiles
- Karma system (account-bound, optional anonymous display)
- Admin moderation tooling (7 queues + audit log)
- Auth via Clerk with work-email and LinkedIn OAuth as trust signals

**Out (deferred):** comp data, employee reviews, job portal, AI summaries, employer paid profiles, interview tracker, i18n content, LinkedIn employment-history verification. See [PLAN.md §V1 scope](PLAN.md#v1-scope) for the deferred list.

---

## Architecture

Modular monolith, event-driven internals. Aggregation is async (seconds-to-minutes lag accepted).

```
┌─────────────────────────────────────────────────────────┐
│  Next.js 15 App Router (Vercel free tier)              │
│  ├── SSR/SSG pages (all SEO surfaces)                  │
│  ├── Route handlers + server actions                   │
│  └── Clerk auth                                         │
└────────────┬────────────────────────────────────────────┘
             │
   ┌─────────┴─────────┬───────────────┬──────────────┐
   ▼                   ▼               ▼              ▼
┌──────────┐    ┌──────────────┐  ┌─────────┐  ┌──────────┐
│   Neon   │    │  Typesense   │  │  Redis  │  │   R2     │
│ Postgres │    │ (self-host)  │  │ (queue+ │  │ (object  │
│ (matviews│    │  (facets +   │  │  cache) │  │  store)  │
│ + events)│    │   search)    │  └────┬────┘  └──────────┘
└─────┬────┘    └──────▲───────┘       │
      │                │                │
      │ LISTEN/NOTIFY  │                │
      ▼                │                ▼
┌──────────────────────┴─────────────────────┐
│  BullMQ worker (Hetzner CX22, Docker)      │
│  ├── aggregation refresh                    │
│  ├── Typesense indexing                     │
│  └── notification dispatch (Resend)         │
└─────────────────────────────────────────────┘

Errors: Sentry  •  Email: Resend  •  Hosting: Vercel + 1 Hetzner box
```

Full table of choices: [PLAN.md §Architecture & stack](PLAN.md#architecture--stack).

---

## Data model

Full current reference: [docs/data-model.md](docs/data-model.md). The executable
schema source is the Drizzle barrel at
[packages/db/src/schema/index.ts](packages/db/src/schema/index.ts).

| Domain | Models |
|---|---|
| Core content | `interview_reports`, `rounds`, `questions`, `question_topics` |
| Taxonomy | `companies`, `roles`, `topics`, `company_levels` |
| Trust and moderation | `user_verifications`, `mod_action_logs` |
| Workflow | `submission_drafts`, `events` |
| Derived reads | `aggregates_company_role`, `aggregates_company_role_level`, Typesense collections |

---

## Trust model (3 layers)

| Layer | Mechanism | Badge |
|---|---|---|
| 1. Person legitimacy | Email + Clerk + captcha | (required, no badge) |
| 2. Professional legitimacy | LinkedIn OAuth **or** work-email | ✓ Verified Professional |
| 3. Per-report evidence | Recruiter email / calendar invite (admin-reviewed) | ✓✓ Recruiter-Confirmed |
| 2 (own company) | Work-email at the company being reviewed | ✓✓✓ Verified Employee |

Aggregation weights: unverified 0.3 / verified-pro 0.7 / recruiter-confirmed 1.0 / verified-employee 1.0.

Anonymity is **display-only** — `created_by_user_id` is always populated; the `display_attribution` flag controls only what readers see.

---

## URL surface (canonical pages)

| URL | Role |
|---|---|
| `/companies/[company]/[role]/[level]` | **Canonical wedge page** — aggregated insights (Position Y) + report list (Position X) |
| `/topics/[topic]` | Question-first browse |
| `/topics/[topic]/[company]` | Topic × company cross-cut |
| `/reports/[report-id]` | Individual report detail |
| `/submit` | Submission form (single-page, collapsible per-round cards) |
| `/admin/*` | Mod queues + audit (role-gated via Clerk metadata) |

Full table: [PLAN.md §URL structure](PLAN.md#url-structure).

---

## Repository layout (target)

> Sprint 0 establishes this. Don't take this as fact yet — it's the destination.

```
fromtheloop/                 # working dir is `company_reviews/` on disk
├── PLAN.md                  # locked design decisions (source of truth)
├── README.md                # this file
├── sprints/                 # per-sprint plans (00 → 07)
│   ├── README.md
│   ├── sprint-00-scaffolding.md
│   ├── sprint-01-submission-form.md
│   └── ...
├── docs/                    # design docs (ADRs, RFCs, runbooks)
│   ├── adr/                 # decision records (one per locked-in choice)
│   ├── rfc/                 # proposals under consideration
│   └── runbooks/            # operational guides (mod, deploys, restore)
├── apps/
│   ├── web/                 # Next.js 15 App Router
│   └── worker/              # BullMQ worker (Hetzner)
├── packages/
│   ├── db/                  # Postgres schema, migrations, queries
│   ├── search/              # Typesense client + indexers
│   ├── core/                # domain logic (reports, karma, trust, moderation)
│   └── shared/              # types, validators (Zod), constants
└── infra/                   # Docker compose, Hetzner provisioning, CI
```

---

## Sprints

8 × 2-week sprints to alpha. Each sprint has its own plan with goals, scope, deliverables, and exit criteria.

| # | Focus | Plan |
|---|---|---|
| 0 | Scaffolding & infra | [sprints/sprint-00-scaffolding.md](sprints/sprint-00-scaffolding.md) |
| 1 | Submission flow — form, schema, taxonomy autocomplete, drafts | [sprints/sprint-01-submission-form.md](sprints/sprint-01-submission-form.md) |
| 2 | Submission flow — rounds, questions, tags, validation, soft delete | [sprints/sprint-02-submission-deep.md](sprints/sprint-02-submission-deep.md) |
| 3 | Aggregation pipeline, materialized views, Typesense indexing | [sprints/sprint-03-aggregation.md](sprints/sprint-03-aggregation.md) |
| 4 | Canonical wedge page (Position Y + X), search & filters | [sprints/sprint-04-wedge-page.md](sprints/sprint-04-wedge-page.md) |
| 5 | Topic browse, profiles, karma | [sprints/sprint-05-topics-profiles-karma.md](sprints/sprint-05-topics-profiles-karma.md) |
| 6 | Admin panel, mod queues, RBAC, audit log | [sprints/sprint-06-admin-moderation.md](sprints/sprint-06-admin-moderation.md) |
| 7 | Legal pages, SEO polish, performance, alpha-ready | [sprints/sprint-07-launch-polish.md](sprints/sprint-07-launch-polish.md) |

See [sprints/README.md](sprints/README.md) for cadence, ceremonies, and how to use these docs solo.

---

## Local development

```bash
# Prereqs: Node 20+, pnpm 9, Docker
pnpm install
cp .env.example .env.local  # then fill in the values you have (see note below)
pnpm docker:up              # Postgres, Redis, Typesense locally
pnpm db:migrate             # Drizzle: applies SQL in packages/db/src/migrations
pnpm db:seed                # placeholder row (Sprint 1 swaps in seed_dummy + seed_curated)
pnpm dev                    # Next.js on :3000
pnpm worker:dev             # BullMQ worker
```

Verified to cold-boot to a live `:3000` in well under 2 minutes from a fresh clone
(seconds once the pnpm store and Docker images are warm; the first run on a new
machine also pulls the `postgres`/`redis`/`typesense` images, which dominates).

- **Clerk keys are optional to boot.** With `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  empty, Clerk starts in **keyless mode** and the public pages render fine; it
  prints a claim link in the dev log. You only need real keys (from
  [dashboard.clerk.com](https://dashboard.clerk.com)) to exercise sign-in and
  the gated `/dashboard`.
- Environment variables are documented in `.env.example`. `.env.local` is
  git-ignored and is what the dev stack reads.

---

## Conventions

- **Admins never edit user content** (Section 230 hygiene). They approve / reject / hide / delete only.
- **Soft delete, not hard delete** — 90-day PII-purged audit window.
- **i18n-ready from day 1** — `next-intl` + `locale` column on user-content schemas. English content only in V1.
- **All SEO pages SSR/SSG** — no CSR-only on canonical URLs.
- **Query-param filters, not new canonical paths** — protects programmatic SEO.

---

## Open items

Tracked in [PLAN.md §Open items](PLAN.md#open-items-not-designed-yet--execution-level):
- Monetization direction (V2+ — defines architecture seams)
- Visual design direction (run `/frontend-design` once wireframes exist)
- Sprint-level estimation + risk tracking (rolling, per-sprint)

---

## Licence & contact

- Solo project, all rights reserved (pre-incorporation). Licence to be added before public source.
- `legal@fromtheloop.com` (or final domain) — DMCA / takedown contact, set up via Cloudflare email routing before alpha.
