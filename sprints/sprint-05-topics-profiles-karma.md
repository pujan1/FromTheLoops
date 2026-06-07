# Sprint 5 — Topics, Profiles, Karma

> **Weeks 11–12**

## Goal

Ship the second discovery surface (question-first browse via `/topics`), the social surface (company + user profiles), and the karma system that ties contribution to visible reputation.

## Why now

Sprint 4 covered the primary company × role × level discovery axis. `/topics` is the orthogonal axis — "I'm prepping for system-design rate-limiter questions, who has been asked these?" Profiles and karma are needed for trust + identity *before* admin/mod tools land in Sprint 6.

## In scope

- `/topics` index — all curated tags grouped by category, count badges
- `/topics/[topic]` — questions aggregated across companies for that tag
- `/topics/[topic]/[company]` — same, filtered to a company (programmatic SEO win)
- `/companies/[company]` rollup page upgraded with real content (top roles, recent reports, top tags)
- `/u/[username]` user profile — public-facing: display name, badges, karma, contributed reports (respecting `display_attribution`)
- `/dashboard` — private, signed-in user view of their own submissions + drafts
- `/settings` — display name, attribution defaults, account delete, export data (JSON)
- **Karma system**:
  - Earn rules: unverified 5 / verified-pro 10 / recruiter-confirmed 25 per submission
  - Helpful-flag earn: +1 per helpful-flag from another verified user (rate-limited, no self-flag)
  - Tier badges: 10 / 100 / 1000
  - Karma persisted on `users` table; recomputed by worker on relevant events
  - Aggregation ranking uses karma-weighted helpful-flag signal (no submitter-rank boost)
- Anonymity disclosure inline on submission form ("posted anonymously — your karma is still credited; this is account-bound")

## Out of scope

- Admin moderation UI (Sprint 6)
- Karma-affects-search ranking experiments (deliberately never — PLAN.md decision)
- Reactions beyond helpful-flag (V2)
- Notification preferences (V2 — V1 has only the submission-confirmation email)

## Deliverables

| Artifact | Where |
|---|---|
| `/topics`, `/topics/[topic]`, `/topics/[topic]/[company]` routes | `apps/web/app/topics/` |
| `/u/[username]`, `/dashboard`, `/settings` routes | `apps/web/app/` |
| `helpful_flags` table + UI on report detail | `packages/db/`, `apps/web/components/reports/` |
| Karma compute job (worker, debounced per user) | `apps/worker/jobs/recompute-karma.ts` |
| Export-my-data endpoint returns JSON dump | `apps/web/app/api/export/route.ts` |
| Account-delete flow (soft-delete + PII purge schedule) | `apps/web/app/settings/delete/` |
| `docs/adr/0005-karma-design.md` documenting earn rules + non-goals | repo |

## Exit criteria

- [ ] `/topics/system-design-rate-limiter` lists 5+ seed questions with company chips, links to source reports
- [ ] `/topics/system-design-rate-limiter/stripe` filters cleanly
- [ ] `/u/[username]` shows badges + contributed reports; anonymous reports do NOT appear here
- [ ] Karma tier upgrade fires immediately (or within 60s of trigger) and reflects on profile
- [ ] Helpful-flag UI works, rate-limited to 50/day/user, can't self-flag
- [ ] `/settings → Export my data` returns a JSON dump covering all user-authored content + verification status
- [ ] Account delete triggers soft-delete + schedules 90-day PII purge; user immediately signed out
- [ ] `/dashboard` shows draft list with continue/discard actions, plus submitted reports w/ edit-window status

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Anonymous-by-default vs karma-by-account confusion in UX copy | Reuse the disclosure pattern from PLAN.md §Anonymity; copy reviewed before sprint exit; mention in submission form AND `/settings`. |
| Helpful-flag becomes a sock-puppet vector | Require Layer 1+2 trust (verified-pro min) to flag; flag from same IP/device fingerprint discounted by Clerk signals. |
| `/topics/[topic]/[company]` page generates thin content for rare cells | Apply Sprint 3 sparse-data fallback — broaden to topic-only with banner. |

## Dependencies

- Sprint 4 exit criteria
- Karma recompute reuses Sprint 3 event/worker pattern

## Day-by-day skeleton

| Day | Focus |
|---|---|
| 1 | `/topics` index + `/topics/[topic]` — read from existing aggregates + Typesense |
| 2 | `/topics/[topic]/[company]` + sparse fallback reuse |
| 3 | `/companies/[company]` rollup upgrade with real content |
| 4 | `/u/[username]` profile + display-attribution filtering |
| 5 | `/dashboard` — own drafts + submitted reports |
| 6 | `/settings` — display name, defaults, export, delete |
| 7 | Karma earn rules + compute worker job |
| 8 | Helpful-flag UI + rate limits + tier badges |
| 9 | Anonymity disclosure pass; ADR-0005 |
| 10 | Buffer; exit criteria |

## Notes & decisions

_Append-only._

### Days 1–3 — topic browse surface (`/topics`, `/topics/[topic]`, `/topics/[topic]/[company]`) + company rollup top-tags

- **Topic categories are a DB column, not a code map.** Added a `topic_category` pgEnum (`algorithms`, `system-design`, `fundamentals`, `machine-learning`, `data-engineering`, `infrastructure`, `behavioral`) + nullable `topics.category` (migration `0012_topics_category`). `seed/curated.ts` was restructured into category-keyed groups (declaration order = index section order) so the category is first-class data; pending user-suggested tags stay `null` → an "Other" bucket. Display labels + section order live in `apps/web/lib/topic-categories.ts`, keyed on the enum.
- **Topic pages are question-grain, not report-grain.** PLAN.md §URL: "topic pages aggregate questions". `/topics/[topic]` lists individual questions (each carrying its source report's company/role/level/outcome, linking to `/reports/[id]`) rather than report cards. The cell-density decision still counts **distinct reports** (matching the wedge's <10-reports rule), so many questions from one report still read as a small sample.
- **Sparse fallback reused on the topic×company axis.** `decideTopicCompanyView()` added to `core/aggregation/scope.ts` — the topic analogue of `decideLevelView`: a thin `(topic, company)` cell broadens to the topic across all companies, shows a banner (`TopicSparseBanner`, reusing the shared sparse-banner styling), and canonicalizes **up** to `/topics/[topic]` so thin near-duplicate leaves don't compete for index space. Verified: dense cells (e.g. system-design × Stripe) self-canonicalize; thin cells (e.g. prompt-engineering × Stripe) broaden + up-canonical.
- **Canonical URL contract extended.** `topicsPath` / `topicPath` / `topicCompanyPath` added to `@fromtheloop/shared`; `resolveTopic` / `resolveTopicCompany` to `core/url`. `Breadcrumb` promoted from `companies/_components` to `@/components/breadcrumb` (shared by both browse surfaces).
- **Company rollup "top tags".** `listTopTopicsForCompany()` powers a new "Top topics" chip row on `/companies/[company]`, each chip linking to the topic×company leaf (capped at 12).
- **All reads are direct Postgres** (consistent with Sprint 4 `browse.ts`), not Typesense — the day-1 skeleton mentioned Typesense, but the topic pages are structured slug-keyed aggregation, the same shape as the company/role browse reads; Typesense stays the free-text-search path.
- Note: the exit-criteria example slug `system-design-rate-limiter` is illustrative — the real curated slugs are `system-design` + `rate-limiting`. Verified `/topics/system-design` lists 171 questions across 107 reports at 9 companies with company chips + report links.
- Tests: `packages/db/tests/topics-browse.test.ts` (index/counts/companies/question-list/pagination/top-tags), `scope.test.ts` + `url.test.ts` additions, `types.test.ts` + `seed.test.ts` category assertions. Full suite green (db 151, core 47, shared 32); typecheck + web lint clean.
- **Not yet deployed.** Migration `0012` + reseed applied to **local** only. Production (Neon) migrate + worker deploy remain the manual steps per `docs/runbooks/worker-deploy.md`.
