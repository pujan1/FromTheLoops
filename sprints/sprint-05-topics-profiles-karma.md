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

- [x] `/topics/system-design-rate-limiter` lists 5+ seed questions with company chips, links to source reports — _real slug `system-design`: 171 questions across 107 reports / 9 companies (Days 1–3)_
- [x] `/topics/system-design-rate-limiter/stripe` filters cleanly — _topic×company leaf + sparse-fallback verified (Days 1–3)_
- [x] `/u/[username]` shows badges + contributed reports; anonymous reports do NOT appear here — _seed `asyncawait`: 15 attributed shown, 8 anonymous hidden (Day 4)_
- [x] Karma tier upgrade fires immediately (or within 60s of trigger) and reflects on profile — _report writes via worker NOTIFY (ms) + 30s sweep; flag earn inline; Day-10 live smoke: author 0→96 on flag (Days 7–8)_
- [x] Helpful-flag UI works, rate-limited to 50/day/user, can't self-flag — _all three guards db-tested + live smoke (Day 8)_
- [x] `/settings → Export my data` returns a JSON dump covering all user-authored content + verification status — _`/api/export`, hash-redacted (Day 6)_
- [x] Account delete triggers soft-delete + schedules 90-day PII purge; user immediately signed out — _`deleteUserAccount` + Clerk `deleteUser` + daily purge sweep (Day 6)_
- [x] `/dashboard` shows draft list with continue/discard actions, plus submitted reports w/ edit-window status — _`listOwnReports` + `listDrafts` (Day 5)_

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

### Day 4 — public user profile (`/u/[username]`) + display-attribution filtering

- **Username is the public URL key, never the UUID or Clerk id.** `getUserByUsername` (exact match on the existing `users_username_uq` index) added to `db/users.ts`; `resolveUser` added to `core/url/resolve.ts` mirroring `resolveCompany`/`resolveTopic` (null → 404). The full `User` row rides along so the page gets `id` (to read reports/stats) + `displayName`/`createdAt` for the header. `userPath` → `@fromtheloop/shared`, `routes.user` → web.
- **Display-attribution is the privacy boundary, enforced in SQL.** `listReportsForUser` (new, in `browse.ts`) ANDs `display_attribution = 'display_name'` onto the standard VISIBLE filter, so a report the author posted **anonymously never appears on their public profile** — even though they still earn karma for it (anonymity is account-bound, not contribution-bound; PLAN.md §Anonymity). Verified on seed user `asyncawait`: 8 anonymous + 15 attributed active → profile shows exactly the 15; `?outcome=offer` → 9, matching the DB.
- **Report rows now carry their company.** Added `companySlug`/`companyName` to `CellReportListItem` + a `companies` join in the shared `runReportList` SELECT (the one report-list query). The profile is the first **cross-company** feed, so `ReportList`'s `companyName` prop became optional — omit it and each row's own company is used; the company/role/level surfaces still pass it once (constant there). No behavior change for existing callers.
- **Badges are derived from real signals, no karma column yet.** Header shows a "Verified contributor" pill (from `user_verifications` distinct-company count — `getUserProfileStats`), a public-report count, and "Member since {Month Year}". Karma + tier badges are deliberately **deferred to Day 7/8** (column doesn't exist); the badge row is the slot they drop into. Seed has no `user_verifications`, so the verified pill is correctly absent on seed profiles (logic covered by `getUserProfileStats` unit tests).
- **Accounts with only anonymous (or zero) reports still resolve** — the profile renders with an empty list + an explicit "Reports posted anonymously don't appear here" line, preserving the contract rather than 404ing a real user.
- Tests: `packages/db/tests/user-profile.test.ts` (username lookup, attributed-only feed incl. anonymous/deleted/pending/other-author exclusion + per-row company, stats with distinct-company verification collapse, zero-footprint case); `core/tests/url.test.ts` additions (`userPath` builder + `resolveUser`). Full suite green (db 156, core 48, shared 32); typecheck clean; web build registers `/u/[username]`; web lint clean (one pre-existing unrelated warning).
- **Not yet deployed.** Pure code (no migration this day); ships with the rest of Sprint 5 on the next worker/web deploy.

### Day 5 — private dashboard (`/dashboard`): own drafts + submitted reports

- **The dashboard is the owner's view, so it deliberately ignores the public visibility filters.** New `listOwnReports(db, userId)` in `db/reports.ts` returns the user's reports regardless of `display_attribution` and **including `pending_moderation`** (you should see a report you just submitted before a mod clears it). It excludes only soft-deleted rows. It carries `status` + `lockedAt` + `displayAttribution` — fields the public browse reads never expose — so the page can label moderation state, edit-window state, and "posted anonymously". Separate query from the public `runReportList` (different filter + columns) rather than overloading it.
- **Drafts list reuses the existing `listDrafts`** (newest-touched first). Each row gets a human label derived from the tolerant draft jsonb (`company · role · level`, or "Untitled draft" for a blank one) via a `submissionDraftSchema.safeParse` in the page, a relative "last edited" time (`Intl.RelativeTimeFormat`), a **Continue** link (`/drafts/[id]`, the existing resume page) and a **Discard** action.
- **Discard mirrors the report soft-delete pattern.** `discardDraftAction` (new `dashboard/actions.ts`) re-checks auth + ownership server-side (`deleteDraft` is `(id, userId)`-scoped — a foreign id is a silent no-op, no existence oracle) then `revalidatePath`+redirect. `DiscardDraftButton` is a client component only to interpose a `confirm()` (UX guard, not security) — same shape as `DeleteReportButton`.
- **Edit-window status reuses `isReportEditable` + `EDIT_WINDOW_MS`** (the exact logic the report detail page uses): within 24h → "Editable for Nh", else "Locked". Moderation status → a `FtlStatusBadge` ("Pending review" / "Published"). The report title links to `/reports/[id]`, where the actual edit/delete controls live (no duplication).
- **Not indexable.** `metadata.robots = { index: false }` — it's a private surface. Route already gated by middleware `/dashboard(.*)`; confirmed unauthenticated `/dashboard` is blocked (same 404 gate as `/submit` and `/drafts` in this Clerk setup — pre-existing behavior, not changed here). The signed-in render wasn't visually verified (no Clerk session available in this environment); covered instead by db tests + typecheck + build.
- Tests: `packages/db/tests/reports.test.ts` additions — `listOwnReports` returns non-deleted owner rows newest-first with company/role/status/edit-window, excludes deleted + other-user rows, and the empty-user case. Full suite green (db 159, core 48, shared 32); typecheck clean; web build registers `/dashboard` as a real page (1.05 kB, up from the 331 B placeholder); web lint clean (one pre-existing unrelated warning).
- **Not yet deployed.** Pure code (no migration this day); ships with the rest of Sprint 5.

### Day 6 — `/settings`: display name, attribution defaults, data export, account delete

- **Three new columns on `users` (migration `0013_user_settings_columns`, applied local-only).** `default_display_attribution` (the existing `display_attribution` pgEnum, NOT NULL default `'anonymous'`) is the per-user starting attribution for new submissions; `deleted_at` + `pii_purged_at` are the account-lifecycle pair, mirroring the columns `interview_reports` already carries. No new enum — attribution reuses the report enum so the form/select share one value set.
- **Account-delete is soft-delete, never hard-delete — the schema forces it.** `interview_reports.created_by_user_id` is `ON DELETE RESTRICT` (the report is the audit trail; PLAN.md §230), so a user who authored anything can't be row-deleted. `deleteUserAccount(db, userId)` (new in `db/users.ts`) does it all in one transaction: soft-deletes every still-active report (status→`deleted`, stamp `deleted_at`) **emitting a `deleted` event per report** so cells re-aggregate + search docs drop, hard-deletes the throwaway drafts, then stamps `users.deleted_at`. Idempotent (a second call returns `alreadyDeleted: true`); returns `{ reportsDeleted, alreadyDeleted, found }`. The user's PII is deliberately left intact at delete time — the 90-day window is the appeal/audit buffer.
- **PII purge reuses the existing daily sweep.** `purgeDeletedUserPii(db, before)` nulls `email`/`username`/`display_name`/`clerk_id` (also freeing the two unique indexes) and stamps `pii_purged_at` for accounts deleted before the cutoff; `USER_PII_RETENTION_MS` aliases the report window (`PII_RETENTION_MS`, 90d) so both scrubs share one figure. The worker's `purge-deleted-pii` job (already cron'd daily at 03:17 UTC) now runs **both** scrubs in one pass — no new queue/scheduler, just a second call + a combined log line.
- **Account-delete's web half also kills the Clerk principal.** `deleteAccountAction` (`settings/actions.ts`) requires a typed `DELETE` token (re-checked server-side, not just client UX), calls `deleteUserAccount`, then `clerkClient().users.deleteUser()` to revoke every session — that's the "immediately signed out" half. Clerk deletion is **best-effort + last**: local soft-delete is the source of truth; if Clerk errors we still redirect to a signed-out home rather than strand the user on a half-deleted account. The confirmation lives on its own route (`/settings/delete`) so the irreversible action is never a stray click.
- **Export is a download, not a page.** `getUserDataExport(db, userId)` (in `db/users.ts`) assembles a plain serializable dump — account + **all** reports (every status; it's the owner's own data) with the full rounds→questions→topics tree, drafts, and verification status (company + method + date, **never** the evidence hash). `/api/export` (GET, Node runtime, `cache-control: no-store`) streams it as `attachment; filename="fromtheloop-export.json"`. Same flat-join→fold approach as `getReportForEdit`, but across all the user's reports at once.
- **Default attribution wired through the submit flow.** `SubmitPage` reads the user's `default_display_attribution` and passes it to `SubmitForm` as a new `defaultAttribution` prop; the form's initial state is now `initialData?.attribution ?? defaultAttribution ?? "anonymous"` (a resumed draft's own choice still wins). The disclosure copy ("posting anonymously still credits your karma — it's account-bound") is repeated on `/settings`, satisfying the Sprint 5 risk-mitigation note to surface it in both the form AND settings.
- **`updateUserSettings`** does partial updates (an undefined field is left as-is), trims the display name, and normalizes empty→null (so a blank name falls back to the username on the profile). The settings form posts to `updateSettingsAction` and redirects with `?saved=1` / `?error=name-too-long` for the success/validation notice.
- **Routes + gating.** `routes.settings` / `settingsDelete` / `exportData` added; middleware's protected matcher gains `/settings(.*)`. `/api/export` is **not** in the matcher — it does its own 401 in the handler (a download link, never a navigation, so 401 beats a sign-in redirect).
- Tests: `packages/db/tests/user-settings.test.ts` (10 cases) — settings trim/normalize/partial-update; account-delete cascades reports+drafts, idempotency, unknown-id `found:false`, other-author isolation; PII purge cutoff/idempotency/live-account-safety/index-freeing; export tree shape + hash-redaction + null-for-unknown. Full db suite green (169); worker typecheck clean; web lint clean (one pre-existing warning); web build registers `/settings`, `/settings/delete`, `/api/export`. The signed-in renders + the Clerk `deleteUser` call weren't exercised live (no Clerk session in this env) — covered by db tests + build + typecheck.
- **Not yet deployed.** Migration `0013` applied to **local** only; Neon migrate + worker deploy remain the manual steps per `docs/runbooks/worker-deploy.md`.

### Day 7 — karma earn rules + recompute worker job

- **Karma is a denormalized cache, never an increment.** Added `users.karma` (int NOT NULL default 0, migration `0014_user_karma`, local-only). The single source of truth is the user's reports (+ helpful-flags from Day 8); `recomputeUserKarma(db, userId)` (new `packages/db/src/karma.ts`) **rebuilds the whole figure from scratch** in one transaction (read prior → sum → write only if changed; returns `{karma, previous, changed, found}`). Recompute-from-scratch = fully idempotent, so the worker can re-run it on every event, on a retry, or from a backfill and always land the same value — the same stance the Sprint 3 aggregate refresh takes. The earn constants (`KARMA_EARN = {unverified:5, verifiedPro:10, recruiterConfirmed:25}`, PLAN.md §Karma) live in `db` (a backend invariant, not display logic), keeping the `db` package's no-core/shared rule intact.
- **A report's tier reads live from `user_verifications`, not the denormalized flag.** The recompute SQL sums `EXISTS(user_verifications for this report's company) ? 10 : 5` over the author's NON-deleted reports. Reading the live verification (rather than `interview_reports.evidence_verified`, whose maintainer worker doesn't exist yet) means karma self-heals the moment a verification is added, regardless of flag staleness. Deleting a report withdraws its karma (status `deleted` is excluded); `pending_moderation` still counts (you earn on submit, before a mod clears it — consistent with the Day 5 dashboard).
- **Recruiter-confirmed (25) is deferred, not dropped.** Layer-3 per-report evidence (PLAN.md §Trust "✓✓ Recruiter-Confirmed") is admin-reviewed and has no storage until Sprint 6 moderation tools. The constant exists and the `CASE` will grow a third branch the moment a per-report "evidence approved" flag lands; today the rule degrades cleanly to the 5/10 split. Verified live on seed user `asyncawait`: 23 non-deleted reports × 5 (seed has no verifications) = **115 karma**, persisted on first recompute.
- **Karma rides the events outbox as a THIRD consumer.** Added `events.karma_processed_at` + a partial `events_karma_pending_idx` (same migration) and the `claimUnprocessedKarmaEvents` / `markKarmaEventProcessed` / `countUnprocessedKarmaEvents` trio mirroring the aggregate + search consumers — each drains the one event log on its own marker, so a slow recompute never stalls the aggregate refresh or the indexer (and vice-versa). The event log is per-REPORT but karma is per-USER, so the consumer makes one extra hop: `getReportAuthorId(db, reportId)` (new in `reports.ts`) resolves event → report → author.
- **The worker job is two-stage and debounced per user.** `apps/worker/src/jobs/recompute-karma.ts`: stage 1 (`event`) resolves the event's author, enqueues a stage-2 `recompute` job, then marks the event drained (mark-last = at-least-once; the idempotent recompute makes the sweep's redo harmless). Stage 2 (`recompute`, data `{userId}`) is enqueued with **BullMQ `deduplication` keyed on the userId** (`KARMA_DEBOUNCE_MS = 2s`), so a burst of events for one user — e.g. account-delete soft-deleting N reports → N `deleted` events — collapses to a single rebuild. A repeatable `sweep` (30s, matching the other consumers) is the dropped-NOTIFY fallback. Because the processor must enqueue onto its own queue, it's built via a `makeProcessRecomputeKarma(queue)` factory; wired into `index.ts` as the third LISTEN consumer + a third worker. The 30s sweep + millisecond NOTIFY fast path satisfy the exit-criterion "tier upgrade reflects within 60s" with wide margin.
- **Profile shows the karma number now; tier badges are Day 8.** `/u/[username]` reads `user.karma` straight off the row (already rode along from the Day 4 resolve) into an `info` badge in the existing badge slot. Anonymous reports still don't appear in the feed, but their karma DOES count toward this account-wide total (anonymity is display-only; PLAN.md §Anonymity). The 10/100/1000 **tier** badges land with the helpful-flag work in Day 8.
- Tests: `packages/db/tests/karma.test.ts` (9 cases) — unverified-5/verified-pro-10 split, pending counts/deleted excluded, other-author isolation, idempotency + `changed`/`previous` reporting, downward recompute on delete, zero-report + unknown-id (`found:false`), `getReportAuthorId`; `events.test.ts` gains a karma-marker case (independent drain, guarded double-mark no-op, aggregate marker untouched). Needed `::int` casts on the `CASE` branches — bound params are otherwise untyped and `SUM(text)` errors. Full suite green (db 179, core 48, shared 32); db + worker typecheck clean; web lint clean (one pre-existing warning); web build registers `/u/[username]`. The BullMQ/Redis transport is typecheck/build-verified only (not unit-tested), matching how the other two consumers are treated.
- **ADR-0005 (karma design) is still owed** — Day 9 writes it (earn rules + the "karma never boosts the submitter's own search ranking" non-goal). Note: `docs/adr/0005-` is already `aggregation-strategy`; the karma ADR will need the next free number (0007/0008), not literally `0005` as the sprint skeleton wrote.
- **Not yet deployed.** Migration `0014` applied to **local** only (and the local `asyncawait` row is now at its real computed karma); Neon migrate + worker deploy remain the manual steps per `docs/runbooks/worker-deploy.md`. The new `recompute-karma` queue stands itself up on worker boot (idempotent `upsertJobScheduler`), so no manual provisioning beyond the deploy.

### Day 8 — helpful-flags (UI + rate limits) + helpful-flag karma earn + tier badges

- **Helpful-flag is a toggle, not a log.** New `helpful_flags` table (migration `0015_helpful_flags`, local-only): `(report_id, flagger_user_id, created_at)` with a **unique index on `(report_id, flagger_user_id)`** — flagging inserts, un-flagging deletes, double-flag is impossible. Both FKs are `ON DELETE CASCADE` (a hard-deleted flagger/report drops its flags; reports are normally soft-deleted, where the karma earn already excludes them). Indexes: `_report_idx` (count per report) + `_flagger_created_idx` (the windowed rate-limit COUNT).
- **Three guards blunt the sock-puppet vector, all enforced in `db` (UI gating is UX, not security).** `flagReportHelpful` (`packages/db/src/helpful-flags.ts`): **no self-flag** (flagger ≠ report author), **verified-pro only** (`userIsVerified` = holds ≥1 `user_verifications` row — the new helper in `users.ts`), and **50 flags / rolling-24h / user** (`HELPFUL_FLAG_DAILY_LIMIT`; a rolling window, not a calendar day, to dodge timezone ambiguity). Returns a discriminated `FlagResult` (`ok` | `self_flag`/`not_verified`/`rate_limited`/`not_found`). Idempotent: re-flagging an already-flagged report is a benign success that spends no rate. `unflagReportHelpful` is always allowed (withdrawing your own endorsement needs no checks).
- **The earn is to the AUTHOR, recomputed inline.** A flag/un-flag calls `recomputeUserKarma(author)` right after the write — flags don't ride the events outbox (they're not report-cell changes; routing them through it would needlessly fire the aggregate + search consumers), and inline recompute means the +1 lands instantly (well inside the "within 60s" exit criterion). `KARMA_EARN.helpfulFlag = 1`; the recompute SQL grew a second term: `COUNT(*)` of flags on the author's non-deleted reports **from another verified user**, with the flagger's verification + non-self status **re-checked live** in the query — so a flag from a since-unverified account stops counting on the next recompute (covered by the test where verifying Carol retroactively makes her existing flag earn).
- **Tier badges (10/100/1000) are pure presentation in `core`.** New `packages/core/src/karma/tier.ts`: `karmaTier(karma)` walks `KARMA_TIERS` top-down → the highest rung reached (`Contributor` / `Established` / `Distinguished`) or `null` below 10. Lives in `core` (no db/React) so the profile header today and any author byline later share it; the earn RULE stays in `db`. `/u/[username]` now renders the karma number (`info` badge, Day 7) **plus** the tier badge (`success`) when reached.
- **Report-detail UI: count for everyone, toggle for the eligible.** `/reports/[id]` shows a "Was this helpful?" block on **active** reports (not pending/own-only or deleted). The count is public; the interactive control (`HelpfulFlagButton`, a client component on `useActionState`) renders only for a signed-in, verified, non-author viewer and swaps in place on toggle, while the action's `revalidatePath` refreshes the SSR count. Ineligible viewers see the count + a reason hint (sign in / verify / "you can't flag your own — but you earn karma when others do"). `toggleHelpfulFlagAction` decides flag-vs-unflag from **DB truth** (not the client's claimed state), so a stale page or double-submit can't desync; copy lives in the `report.helpful` i18n namespace.
- **Deferred (still sprint scope, not in the Day-8 skeleton): the karma-weighted aggregation RANKING** (in-scope line 27: "aggregation ranking uses karma-weighted helpful-flag signal, no submitter-rank boost"). The data foundation is now in place (`helpful_flags` + flagger-karma is readable), but flipping `runReportList`'s `ORDER BY created_at DESC` to a flag-weighted sort touches **every** browse surface (cell/role/company/profile) and several ordering assertions — too broad to fold into the flagging day safely. Left for the buffer/Day-10 pass; no exit criterion depends on it.
- Tests: `packages/db/tests/helpful-flags.test.ts` (8 cases) — flag success + count + author +1; self-flag/unverified/missing/deleted refusals; idempotent re-flag; un-flag withdraws the +1; the 50/day rate limit (50 filler flags → 51st refused); and the live re-check (a directly-inserted unverified/self flag earns nothing until the flagger is verified). `packages/core/tests/karma-tier.test.ts` (5 cases) — boundaries, highest-rung, labels, ascending invariant. Full suite green (db **187**, core **53**, shared 32); worker typecheck clean; web lint clean (one pre-existing warning); web build registers the updated `/reports/[id]` + `/u/[username]`. The signed-in toggle render wasn't exercised live (no Clerk session in this env) — covered by db tests + build + typecheck.
- **Not yet deployed.** Migration `0015` applied to **local** only; Neon migrate remains the manual step. No worker change this day (flags recompute inline from web), so only the web + db halves ship here.

### Day 9 — anonymity disclosure pass + karma ADR

- **Submission-form disclosure now states the karma fact, not just the default.** The `submit.attribution.note` hint was thin ("Anonymous is the default. You can verify a work email later…") — it never told the user the thing the sprint risk note calls for: that posting anonymously *still credits karma* and that karma is *account-bound*. Rewrote it to: "Anonymous is the default — and posting anonymously still credits your karma. Karma is account-bound, never tied to your public name, so an anonymous report stays anonymous everywhere while you still earn for it…". This satisfies "mention in submission form AND `/settings`" — `/settings` already carried the line since Day 6 ("Posting anonymously still credits your karma — it's account-bound"), so the two surfaces now agree.
- **ADR written as `0007-karma-design.md`, not `0005`.** The sprint skeleton said "ADR-0005", but `0005` has been `aggregation-strategy` since Sprint 3; `0007` was already the reserved-but-unwritten karma slot in the ADR index (flagged this collision back on Day 7). Marked it `accepted` and linked it in `docs/adr/README.md`. The ADR records the whole karma design across Days 7–10 — recompute-from-scratch earn, the helpful-flag earn, tier badges, and (most importantly) the two non-goals: **karma never boosts the submitter's own ranking/search** (the rich-get-richer trap), and the ranking weights the **flagger's** karma, never the author's. Alternatives table covers increment-vs-recompute, outbox-vs-inline for flags, and flat-count-vs-karma-weighted.
- Pure docs + one copy string; no schema/logic change. Web build + lint still clean.

### Day 10 — karma-weighted helpful-flag ranking + exit-criteria pass

- **The deferred ranking landed, and the hot-path risk turned out to be a non-issue.** The Day-8 worry was that reordering `runReportList` would break every browse surface's ordering assertions and threaten the wedge-page query-plan test. Both fears were unfounded: (a) `query-plan.test.ts` asserts against its *own* hardcoded query, not `runReportList`, so it's untouched; (b) the new ordering is `ORDER BY helpful_score DESC, created_at DESC`, and **unflagged reports score 0**, so every existing test (which creates no flags) keeps its exact newest-first order. Net new behavior: only reports readers have endorsed get lifted.
- **The signal weights the FLAGGER, never the submitter** (ADR-0007's hard non-goal). A `LEFT JOIN LATERAL` per report computes `cnt` (valid flags, for display) + `score = Σ GREATEST(flagger.karma, 1)` over flags from **verified, non-self** flaggers — the same population the karma earn counts. Weighting by `GREATEST(karma,1)` means every valid flag counts ≥1 while a heavier-karma flagger lifts more; the submitter's own karma appears nowhere in the sort. `helpfulCount` now rides on `CellReportListItem` (the only constructor is `runReportList`, so no other caller breaks) and the report card appends "· N found helpful" to its excerpt so the lift is legible, not arbitrary.
- **Exit criteria: all 8 checked.** Most were satisfied by their build day; Day 10 added a consolidated **live smoke** on the seeded DB that exercises the riskiest three at once: pick a real 20-report cell, flag its *last* report from a freshly-verified user → flag succeeds, the **author's karma recomputes 0→96 inline** (criterion #4 "within 60s" — it's instant), the report **jumps to position 1** with `helpfulCount 1` (the ranking), and un-flagging cleanly reverts it (author back to 95). See the checked boxes above for the per-criterion evidence.
- Tests: `browse.test.ts` gains a ranking case (a flagged older report outranks a newer un-flagged one; `helpfulCount` rides the row) — full db suite **188** green; core 53, shared 32. Worker typecheck clean; web lint clean (one pre-existing warning); web build green.
- **Sprint scope complete.** Out-of-scope items (admin moderation UI, karma-affects-search experiments, reactions beyond helpful-flag, notification prefs) remain correctly deferred to Sprint 6+ per the plan.
- **Not yet deployed.** The whole sprint's DB changes (migrations `0012`–`0015`) + the `recompute-karma` worker job are applied to **local** only. Production cutover = Neon migrate + worker deploy per `docs/runbooks/worker-deploy.md`, as one batched move when Sprint 5 ships.
