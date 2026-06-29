# Sprint 6 — Admin Panel & Moderation

> **Weeks 13–14**

## Goal

A working `/admin/*` panel that can keep the platform clean: all 7 mod queues, RBAC, audit log, and the trust-evidence review path that lights up the ✓✓ Recruiter-Confirmed badge.

## Why now

V1 is single-mod (you). The platform can't open to real users without working moderation tooling because PLAN.md §Moderation operations estimates 30–45 min/day of manual review at alpha. Bad tooling here = doubled mod time.

## In scope

- Clerk metadata RBAC: `user | moderator | admin | super_admin`
- Middleware-gated `/admin/*` route; non-admins get 404
- 7 mod queues, tabbed UI:
  1. Pending companies
  2. Pending tags
  3. Pending role aliases
  4. Recruiter-Confirmed evidence reviews
  5. Community flags
  6. Soft-delete audit (90-day window)
  7. New-user first-submission moderation hold
- `mod_action_log` table append-only; every action writes a row
- Heuristic auto-approve for low-risk pending entities (verified submitter + domain valid + no dedup conflict → auto, logged)
- Trust-evidence upload UI on submitter side (R2 upload, hash stored, image displayed only to mods)
- Evidence review action sets `evidence_verified = true` on report; trust badge recomputed
- Bulk actions on queue lists (approve N, reject N)
- Daily reconciliation worker job: matview / Typesense drift detection (referenced from Sprint 3)
- Slur/PII regex block list editable from admin UI (config table, hot-reloaded)
- Admin "view as user" toggle for debugging (read-only impersonation, logged)

## Out of scope

- LLM moderation (V2)
- Community moderation by high-karma users (V2)
- Admin notifications (V2 — admin polls the panel for now)
- Analytics / dashboards beyond queue counts

## Deliverables

| Artifact | Where |
|---|---|
| `/admin` shell + tabbed queue views | `apps/web/app/admin/` |
| `mod_action_log` table + helper `logModAction()` | `packages/db/`, `packages/core/moderation/` |
| Evidence upload component (R2 signed PUT) | `apps/web/components/submit/evidence-upload.tsx` |
| Per-queue action handlers (server actions) | `apps/web/app/admin/queues/[queue]/actions.ts` |
| Daily reconciliation worker job | `apps/worker/jobs/reconcile.ts` |
| `regex_blocklist` config table + admin editor | `packages/db/`, `apps/web/app/admin/blocklist/` |
| `docs/runbooks/moderation.md` — daily mod walkthrough | repo |
| `docs/adr/0008-rbac-evidence-audit.md` | repo |

## Exit criteria

- [ ] Non-admin user hits `/admin` → 404 (not 401, to avoid leaking the route's existence)
- [ ] Each of the 7 queues lists pending items with relevant context for a snap decision
- [ ] Approving a pending company promotes it; reports referencing it now appear in aggregates
- [ ] Heuristic auto-approve fires on a planted "obviously safe" pending company without admin click
- [ ] Approving evidence on a report flips the trust badge from ✓ to ✓✓ visibly within 60s
- [ ] Every approve/reject/delete writes a `mod_action_log` row with `reason`
- [ ] Daily reconciliation job runs, reports zero drift on a clean dataset, and surfaces fake drift planted in a test
- [ ] Mod can NOT edit user content body (Section 230) — only approve/reject/hide/delete affordances exist
- [ ] Runbook walks through a 30-minute daily mod cycle end-to-end

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| 7 queues × bespoke UIs balloons sprint scope | Build one generic `<ModQueue>` component (list + filter + actions + reason input) parameterized by queue config; each queue is just config. |
| Evidence images contain PII that mustn't leak | R2 signed URLs only; access logged; auto-purge from R2 14 days after evidence reviewed. Document in ADR-0006. |
| Heuristic auto-approve approves something bad | Auto-approved items still write `mod_action_log` + appear in a 24h "auto-approve audit" view for spot-checks. |

## Dependencies

- Sprint 5 exit criteria — profiles + karma make some queue context meaningful (submitter's badges visible in queue UI)
- R2 bucket from Sprint 0

## Day-by-day skeleton

| Day | Focus |
|---|---|
| 1 | RBAC middleware + Clerk metadata wiring; admin route gate |
| 2 | `<ModQueue>` generic component + queue config schema |
| 3 | Pending companies + tags + roles queues (3 instances of the generic) |
| 4 | `mod_action_log` + `logModAction()` + reason input + audit history view |
| 5 | Trust-evidence upload (submitter side) + R2 signed URL flow |
| 6 | Evidence review queue + badge recompute on approve |
| 7 | Community flags, soft-delete audit, new-user hold queues |
| 8 | Heuristic auto-approve rules; auto-approve audit view |
| 9 | Reconciliation worker; regex blocklist editor; "view as user" toggle |
| 10 | Runbook; ADR-0006; exit criteria walkthrough |

## Notes & decisions

_Append-only._

### Day 1 — RBAC + admin route gate ✅ 🟢

Built the four-tier role ladder and re-gated the admin surfaces on it.

- **Role model.** `user | moderator | admin | super_admin` (`apps/web/lib/roles.ts`),
  strictly-increasing rank so `roleAtLeast(role, min)` makes every check inclusive
  upward. Source of truth = Clerk `publicMetadata.role`, surfaced to the app via a
  `CustomJwtSessionClaims.metadata.role` augmentation.
- **Guard.** `lib/admin.ts` rewritten from the old single-purpose allowlist into
  `getRole()` / `requireRole(min)` / `requireModerator()` / `requireAdmin()`.
  `requireAdmin()` keeps its `Promise<string>` signature, so `/admin/health`
  (Sprint 3) is untouched. Still 404 (not 403) for the under-privileged.
- **Break-glass kept.** `ADMIN_CLERK_IDS` env allowlist now resolves to
  `super_admin` rather than being the whole auth model — bootstraps the first
  admin and guarantees a way in if session-token metadata is misconfigured.
- **DB `users.role` stays deferred.** Auth reads Clerk, not Postgres. Revisit only
  if queue UIs need to show/filter a submitter's role without a Clerk round-trip.

**Decisions / deferrals**
- ⏭ The full RBAC + evidence-storage + audit-log decision record is **ADR-0008**,
  still owed on Day 10 (the sprint plan's §Deliverables miscalls it `0006` — the
  ADR index reserves **0008**; fix that line when writing it).
- ⏭ Middleware does session-gating only; role 404 stays page-level (the existing,
  deliberate pattern) — not promoting role checks into middleware.

**Action required by operator (one-time, not code):**
1. Set `ADMIN_CLERK_IDS` in `apps/web/.env.local` to your own Clerk id to reach
   `/admin` in dev (currently empty → no one is admin yet).
2. To grant moderator/admin via metadata, add the claim in Clerk Dashboard →
   Sessions → Customize session token: `{ "metadata": "{{user.public_metadata}}" }`,
   then set a user's `publicMetadata.role`. Until step 2, only the allowlist grants
   access (safe default, not a lockout).

Typecheck clean (`pnpm --filter web typecheck`).

### Day 2 — generic `<ModQueue>` + queue config schema ✅ 🟢

Built the one component that backs all 7 queues, plus the config that drives it.

- **Config (`app/admin/queues/queue-config.ts`).** `QUEUE_CONFIGS: Record<QueueId,
  QueueConfig>` — all 7 queues as plain serializable data (title, description,
  empty text, action buttons, `requiresReason`/`confirm` per action, `bulk` flag).
  Plus the cross-boundary contracts: `ModQueueItem` (render-ready row shape),
  `QueueActionResult`, and `QueueActionFn` (the server-action signature a page
  hands the component). No functions in config, so it crosses RSC→client intact.
- **Component (`app/admin/_components/mod-queue.tsx`, `"use client"`).** Filter,
  select-all + per-row checkboxes (bulk queues only), per-row **and** bulk action
  buttons, a reason prompt that gates reason-requiring actions (Confirm stays
  disabled until a reason is typed → destined for `mod_action_logs.reason`),
  `confirm()` friction for destructive actions, optimistic row removal on the
  action's `processed` ids, and empty/pending/error states. Items live in local
  state so a success drops exactly the processed rows without a refetch.
- **Verified** in `/styleguide` (§11) with mock data + a simulated action:
  filter, badges, relative ages, the green/orange action coloring, and the reason
  prompt all render and behave. Typecheck + lint clean.

**Decisions / deferrals**
- Action coloring uses local CSS (`action--approve|reject|danger|neutral`) rather
  than `FtlButton` — that primitive has no success/danger variant and these are
  compact table-row buttons, not page CTAs.
- Badge tone is a small local vocabulary (`neutral|good|warn|danger`),
  deliberately decoupled from `FtlStatusBadge` (whose statuses are report-specific).
- ⏭ Queue *instances* (real DB fetch + real server actions, gated by
  `requireModerator()` at `app/admin/queues/[queue]/`) are **Day 3**. The styleguide
  demo is the only `<ModQueue>` render so far.

### Day 3 — first 3 live queues (companies / tags / roles) + audit log ✅ 🟢

Wired the generic `<ModQueue>` to real data with working approve/reject, and
pulled Day 4's audit log forward so no mod action ever runs unlogged.

- **Schema.** Added `rejected` to the `taxonomy_status` enum (migration
  `0018_tense_doomsday.sql`, applied to dev). Reject can't delete — reports FK to
  taxonomy with `ON DELETE RESTRICT` — and since every surface filters
  `status='active'`, a rejected row drops out everywhere with no new predicate.
  Updated `tests/types.test.ts` unions + `docs/data-model.md`.
- **DB module (`packages/db/src/moderation.ts`).** `logModAction` (the audit
  write, Day 4 pulled forward); `listPending{Companies,Topics,Roles}` read-models
  (join submitter karma; roles left-join their canonical via `mergedIntoId`); and
  the commands `approve/reject` for each. Each command runs the mutation **and**
  its `mod_action_logs` insert in one transaction (Executor type accepts db or
  tx), is idempotent via a `status='pending'` guard, and returns whether a row
  actually changed. Role approve = **merge**: the canonical absorbs the alias's
  name/aliases, the alias goes `merged`, logged as `merge` with
  `metadata.mergedInto`.
- **Web.** `app/admin/queues/[queue]/page.tsx` (server, `requireModerator()`,
  resolves config by slug → 404 on unknown, fetches + maps to `ModQueueItem[]`),
  `actions.ts` (one generic `runQueueAction`: re-gates server-side, resolves the
  mod's internal `users.id` via `getOrCreateUserByClerkId`, dispatches per
  queue/action, re-checks reason on reject, `revalidatePath`). Admin shell:
  `layout.tsx` (gates the area at moderator floor) + sticky tab nav
  (`_components/admin-nav.tsx`, Health tab admin-only) + `/admin` → first queue.
- **Verified.** Web + db typecheck + lint clean. Backend exercised end-to-end via
  a throwaway-row script (deleted after): approve→active+logged, idempotent
  re-approve (no dup log), reject→rejected+reason logged, role alias
  merge→canonical absorbs name + `merged` + merge audit — **10/10 asserts green**.

**Decisions / deferrals**
- The other 4 queues (evidence, flags, soft-delete, new-user-hold) resolve to a
  valid page with an empty list; their `DISPATCH` entries are absent so any action
  returns a clear "isn't wired for this queue yet" error. They land on their
  sprint days (4–7).
- ⏭ **Dedup/near-match context** in the queue rows (the "near: ‘ACME Co’" hint
  from the styleguide mock) is not computed yet — deferred to the heuristic
  auto-approve work (Day 8), which needs the same dedup signal.
- ⏭ UI click-through left for the operator (the MCP browser isn't signed in);
  seeded 3 pending companies / 1 topic / 1 role in dev for that.

### Day 4 — audit history view ✅ 🟢

Closed out Day 4: the *write* side (`logModAction` + the reason input) was pulled
forward into Days 2–3, so all that remained was the **read** — surfacing
`mod_action_logs` to a moderator.

- **Read-model (`packages/db/src/moderation.ts`).** `listModActions(db, {
  targetType?, targetId?, limit? })` — one query, two surfaces: omit the target
  for a global recent-activity feed, or pass `(targetType, targetId)` for
  "everything that happened to this entity". Left-joins `users` so the row shows
  the acting mod's name (`displayName ?? username`) + karma, not a raw UUID.
  Newest-first, default cap 100. Returns a render-ready `ModActionLogItem[]`.
- **Page (`app/admin/audit/page.tsx`, server, `requireModerator()`).** A timeline
  feed — one dot per action, tinted by action tone (approve/merge green, reject/
  hide amber, delete/ban red), the mod + verb + target as a sentence, the logged
  reason in a quoted block, relative + absolute (hover) timestamps. Each row's
  target id deep-links to `?type=&id=` for that entity's scoped history; `merge`
  rows also link their `metadata.mergedInto` canonical. Empty + scoped states
  handled. New **Audit** tab in `_components/admin-nav.tsx` (moderator-visible).
- **Verified.** web + db typecheck clean, web lint clean (one pre-existing warning
  in `theme-toggle.tsx`, unrelated). Exercised the write→read path end-to-end via
  a throwaway probe (deleted): `logModAction` row read back both globally and
  entity-scoped, mod name joined correctly, reason preserved — then cleaned up,
  dev DB left untouched.

**Decisions / deferrals**
- **No per-queue-row history badge.** A taxonomy row leaves the pending queue
  permanently on its first action (reject → `rejected`, never re-enters pending),
  so a "prior action on this id" badge would essentially never fire on the 3 live
  queues. The entity-scoped audit URL is the honest home for that; it lights up
  for the evidence/flags queues and entity pages on their sprint days.
- ⏭ **Queue-row / entity-page deep-links into the audit view** aren't wired yet
  (the `ModQueueItem.href` slot renders "Inspect ↗" for full-entity inspection, a
  different intent). Trivial to add once entity pages exist (Days 5–7).

### Day 5 — trust-evidence upload ⏸️ PAUSED (R2 billing stuck)

Started Day 5; **blocked before any code** on infra. R2 turned out **not
provisioned** (`docs/technologies/cloudflare-r2.md`: "not integrated yet"; no
`@aws-sdk`; no `R2_*` secrets). The operator's Cloudflare R2 subscription is
stuck in a redirect loop (`/r2/overview` → `/r2/plans` even after "Purchase
complete"), so the `fromtheloop-uploads` bucket couldn't be created. Day 5 — and
**Day 6** (evidence review), which depends on it — are parked until R2 is
un-stuck or we pivot storage (Vercel Blob was the considered alt). **Locked
design (still valid):** evidence attaches **post-submit on the report page**
(not inline in submit); new **`report_evidence`** table (report_id, uploaded_by,
r2_key, content_hash, mime, status, reviewed_*, purge_at) — separate from
`user_verifications` (that's the user→company work-email layer; Day 5 evidence is
per-report and flips `reports.evidence_verified` → ✓✓).

### Day 7 (partial) — soft-delete audit queue ✅ 🟢

Pivoted off the R2-blocked work to the first **storage-free** Day-7 queue. The
generic `<ModQueue>` + the Day-4 audit log carried almost all of it.

- **Enum.** Added `restore` to `mod_action_type` (migration
  `0019_exotic_proemial_gods.sql`, applied to dev) so an undelete reads as its
  own verb in the audit log, not a mislabelled `approve`. Mirror updated in
  `ModActionType` (moderation.ts), `tests/types.test.ts`, and the audit page's
  `ACTION_TONE`/`ACTION_LABEL` (typecheck forces these — they're
  `Record<ModActionType, …>`).
- **DB (`packages/db/src/moderation.ts`).** `listSoftDeleted` — one read-model
  spanning **both** soft-deleted reports and comments still inside the 90-day
  window (`PII_RETENTION_MS`, reused from reports.ts so it matches the purge
  job), excluding already-purged rows (their prose is gone). Heterogeneous list,
  so each item carries a composite id `report:<uuid>` / `comment:<uuid>` +
  `daysLeft` until purge. `restoreSoftDeleted` parses that id, flips
  status `deleted`→`active` + clears `deleted_at` in a tx, guarded by
  `status='deleted' AND pii_purged_at IS NULL` (idempotent; refuses gutted
  content), logging `restore` with the real uuid as target.
- **Web.** `loadItems` case + `DISPATCH["soft-delete"].restore` (the existing
  generic `runQueueAction` needed nothing else); `Soft-delete` tab in admin-nav.
  Rows show type/deleted-by/purge-countdown + a "purging soon" badge ≤7 days.
- **Verified.** db + web typecheck clean, web lint clean (one pre-existing
  unrelated warning), `tests/types.test.ts` 18/18. End-to-end probe (deleted
  after): soft-delete a report → appears in queue (daysLeft 90) → restore →
  active + `deleted_at` null + gone from queue → re-restore is a `false` no-op →
  exactly one `restore` audit row (targetType `report`) → bad id returns `false`.
  **11/11 asserts green**, report left in its original active state.

**Decisions / deferrals**
- Restore targets `active` (reverses the deletion to its visible state). A report
  that was `pending_moderation` when deleted would also restore to `active` — an
  accepted rare edge, since the admin is explicitly choosing to surface it.
- ⏭ Remaining Day-7 queues: **new-user-hold** (reports already default to
  `pending_moderation` — next unblocked one) and **community-flags** (needs a NEW
  reader-abuse-report table; `helpful_flags` is a *positive* toggle, not abuse).
- ⏭ UI click-through still left for the operator (MCP browser unauthenticated).

### Day 7 (partial) — new-user-hold queue ✅ 🟢

The second storage-free Day-7 queue, and the live **content gate**: every first
submission lands `pending_moderation` (`decideInitialReportStatus` in core), and
since nothing sets `evidence_verified` in V1, *every* report is held here until a
mod releases it.

- **Enum + blast-radius.** Added `rejected` to `report_status` (migration
  `0020_marvelous_odin.sql`, dev-applied) for the reject verb. Chosen over
  reusing `deleted` precisely so rejected content stays OUT of the soft-delete
  *restore* queue (that filters `status='deleted'`). Audited the report status
  predicates first: all public/aggregate reads use `='active'` (safe); the
  `<>'deleted'` sites are owner/dedup, no public leak. Mirrors updated:
  `tests/types.test.ts`, and the **owner dashboard badge** (`statusBadge` was
  non-exhaustive — a `rejected` report would have mis-rendered as "Published";
  now shows a danger "Not approved").
- **DB (`moderation.ts`).** `listHeldReports` (pending reports + company/role/
  author/karma context, newest-first). `approveHeldReport` → `active`, and
  because pending→active makes the report newly countable it **emits an
  `updated` report event in the same tx** so the aggregate cell recomputes and
  search upserts the doc (the missing-event trap). `rejectHeldReport` → `rejected`
  with the required reason; it was never active, so no event. Both guarded by
  `status='pending_moderation'` → idempotent.
- **Web.** `loadItems` case (rows deep-link to `/reports/:id`) + `DISPATCH`
  `{approve, reject}` + a **Held** nav tab.
- **Verified.** db+web typecheck, web lint, `types.test.ts` 18/18, and a probe
  (cleaned up): held→approve→active + `updated` event emitted + one `approve`
  log; held→reject→rejected + one `reject` log w/ reason; **rejected report
  absent from BOTH the held queue AND the soft-delete queue**, and
  `restoreSoftDeleted` refuses it. **13/13 green**, report restored to active.

**Decisions / deferrals**
- Rejected reports remain visible in the owner's own dashboard (`getReportsForUser`
  keeps non-deleted rows) as "Not approved" — deliberate transparency. Surfacing
  the rejection *reason* to the owner is deferred (the reason lives in the audit
  log; no owner-facing reason channel yet).
- ⏭ Last Day-7 queue, **community-flags**, still needs its own reader-abuse-report
  table before it can be wired. Days 8–10 (auto-approve, reconciliation/blocklist,
  runbook+ADR-0008) unchanged. Evidence (Days 5–6) still paused on R2.

### Day 7 (partial) — community-flags queue ✅ 🟢

The last Day-7 queue and the only one needing a brand-new table. Done **mod-side
only** (deliberate scope): the queue + commands + audit land now; the reader-side
"Report" button (the writer) is a tracked follow-up.

- **New table `content_flags`** (migration `0021_awesome_darkstar.sql`, dev-applied)
  + 3 enums (`content_flag_target`/`reason`/`status`). A reader abuse-report —
  the inverse of `helpful_flags` (which is a *positive* toggle; `helpful_flags`
  is NOT abuse, hence the new table). Polymorphic `(target_type, target_id)` over
  reports **and** comments (no FK on target_id, mirrors `mod_action_logs`). Unique
  `(target_type, target_id, flagger)` → one flag per reader per item, so the
  queue's flag COUNT is distinct readers. `flagger` FK CASCADE (GDPR erasure),
  `resolved_by` FK RESTRICT (the flag row is the audit record for a dismissal).
- **DB (`moderation/flags.ts`).** `listContentFlags` **groups open flags by
  content** (the unit of decision is the item, not each flag) and fetches context
  for still-ACTIVE content only — flags on already-removed content drop out.
  Two commands: `hideFlagged` (comment → `hidden`; report → soft-`deleted` **+ a
  `deleted` event** so aggregates/search drop it and it becomes restorable in the
  soft-delete queue; logs `hide` with the required reason) and `dismissFlags`
  (flags → `dismissed`, content untouched, **no `mod_action_logs` row** — the
  resolution is self-auditing on the flag rows via `resolved_by/at`). Both
  resolve every open flag on the content in one tx; idempotent via status guards.
- **No hard-delete.** Dropped the planned "Delete" action from the `flags` config
  (was hide/dismiss/delete → now **hide/dismiss**): V1 removes everything softly
  (the 90-day purge worker owns true erasure), so a hard DELETE button would be
  inconsistent with the whole codebase. "Hide" + the soft-delete restore queue
  cover removal-and-recovery.
- **Web.** `loadItems` "flags" case (Type/Author/Reasons fields, a flag-count
  badge + a "sensitive" badge when reasons include pii/harassment, deep-link to
  the content); `DISPATCH.flags = {hide, dismiss}`; a **Flags** nav tab. Also
  **generalized the reason gate** in `runQueueAction` — it now reads
  `requiresReason` from the queue config (covers `hide`) instead of hard-coding
  `actionId === "reject"`.
- **Verified.** db + web typecheck clean, web lint clean (one pre-existing
  unrelated `theme-toggle` warning). Type assertions for the 3 new enums added to
  `types.test.ts` (validated by tsc; the vitest run needs Docker testcontainers).
  Throwaway probe (deleted) on its OWN throwaway report/comment/users:
  group-by-content (count 2 / distinct reasons / comment deep-link), dismiss
  (report stays active, flags dismissed, **zero** new logs, drops from queue,
  re-dismiss=false), comment-hide (→hidden, flag actioned, one `hide` log w/
  reason, re-hide=false), report-hide (→deleted, **one `deleted` event**, one
  `hide` log), malformed id=false. **20/20 green**, all probe rows hard-deleted
  (verified zero residue). Seeded 3 grouped demo flags (2 reports + 1 comment) in
  dev for operator click-through.

**Decisions / deferrals**
- ⏭ **Reader-side "Report" button is the open follow-up** — `content_flags` has
  no product writer yet, so in the running app the queue is seed-only until that
  lands (gate it like `helpful_flags`: signed-in, self-flag block, rolling-window
  rate limit — the `content_flags_flagger_created_idx` is already in place for it).
- A mod-hidden **report** becomes `deleted`, so it surfaces in the **soft-delete
  restore queue** (which filters `status='deleted'`). Accepted/desirable: that's
  the admin's un-hide path. The audit log distinguishes it (a `hide` row by a mod
  vs no row for an author delete).
- Open flags on content removed by another path linger as `open` but invisible
  (the list filters to active content). A cleanup sweep is out of scope; a later
  dismiss/hide on that content would clear them if it ever reappeared.
- **All 7 queues are now wired** except **evidence** (Days 5–6, still paused on
  R2). Remaining: Day 8 auto-approve, Day 9 reconciliation/blocklist/view-as-user,
  Day 10 runbook + ADR-0008.

### Day 8 — heuristic auto-approve + audit view ✅ 🟢

Low-risk pending taxonomy now promotes itself, so the human queue only sees the
judgement calls. Also closed the **Day-3 deferral**: the dedup near-match hint now
shows in the pending rows (same signal the heuristic gates on).

- **Dedup signal (`taxonomy/dedup.ts`).** `nearestActiveMatch(db, {kind, name,
  excludeId})` — the closest ACTIVE same-kind row by pg_trgm similarity over
  name+aliases (reuses the autocomplete indexes). Two thresholds over one score:
  `DEDUP_BLOCK_THRESHOLD = 0.55` (blocks auto-approve — a near-match is a human
  new-vs-merge call) and `DEDUP_HINT_THRESHOLD = 0.35` (just shows the queue hint).
- **Heuristic (`moderation/auto-approve.ts`).** Pure `evaluateAutoApprove(signals)`
  → `{approve, reasons, blockedBy}`; all three signals must pass: **verified
  submitter** (`userIsVerified`), **clean name** (`nameLooksClean` — bounded
  length / has alnum / no control chars; **the Day-9 editable blocklist plugs in
  here**), **no near-duplicate** (score < block threshold). `runAutoApprove(db,
  {only?})` evaluates a single just-suggested entity (the inline path) or sweeps
  all pending companies+topics (worker/manual); each promotion is one guarded tx
  (status='pending' → idempotent) that flips the row active AND logs it. Roles are
  excluded (no inline suggest path). No event on promote — company/topic status
  doesn't gate any aggregate (mirrors the human `approvePending*`).
- **"domain valid" deviation.** The sprint named that as a signal, but
  user-suggested companies carry **no domain** in V1 — nothing to validate. The
  trust signal is verified-submitter; a captured domain becomes a 4th signal later
  (documented in the module header).
- **System actor (`users/system-user.ts`).** `mod_action_logs.mod_user_id` is NOT
  NULL, so auto-approvals are attributed to one idempotent **"Auto-moderator"**
  user (reserved `clerk_id` `system:auto-moderator` no real principal can produce;
  authors no content; 0 karma). The audit timeline renders it like any actor;
  `metadata = {auto:true, reasons}` distinguishes it.
- **Audit view.** `listAutoApprovals(db, {sinceMs})` = the 24h auto=true approvals,
  newest-first, entity names resolved. Page at `app/admin/auto-approve/page.tsx`
  (reuses the audit timeline styles; each row deep-links to the entity's full
  history to reverse it) + an **Auto-approve** nav tab.
- **Queue hint + inline hook.** `listPendingCompanies/Topics` now attach `nearest`
  (one similarity query per row, fine at queue sizes); the company/tag queue rows
  render a "possible dup: X (NN%)" badge (warn ≥55%, neutral otherwise). The
  `suggestPendingCompany/Topic` server actions call `runAutoApprove({only})`
  **best-effort** (swallowed — the row already exists, so a failure never fails the
  suggestion) for instant promotion. A `pnpm --filter @fromtheloop/db autoapprove`
  sweep script is the retroactive/scheduled entry point (**Day 9 wires it into the
  reconciliation worker**).
- **Verified.** db + web typecheck clean, web lint clean (pre-existing
  `theme-toggle` warning only). Throwaway probe (deleted) on fully controlled
  fixtures via the isolated `only` path — pure evaluator matrix, system-user
  idempotency, safe company/topic → active + one system approve log w/
  `auto:true`+reasons, unverified/near-dup/bad-name → held + no log, re-run idempotent,
  audit read-model surfaces both with names+reasons. **22/22 green**, zero residue
  (system-user singleton intentionally kept). Ran the sweep on dev: held all 4
  seeded pending rows (unverified seed submitters → correct, non-destructive).
  Seeded one near-dup pending company ("Adobe Labs" ~ active "Adobe", 55%) so the
  queue shows a live dedup hint.

**Decisions / deferrals**
- The **auto-approve view starts empty** in dev (nothing's been auto-approved —
  all seed submitters are unverified). It populates the moment a *verified* account
  suggests a clean, unique company/tag (the inline hook fires). Not faking demo
  rows there (would mean a fake active company in autocomplete).
- ⏭ **Trust = verified only.** A karma-threshold path for established-but-unverified
  submitters is a possible later signal; kept to verified-submitter for now (faithful
  to the sprint wording + fails safe).
- ⏭ **Reverse-an-auto-approval is manual** (open the entity's audit history). A
  one-click "this was wrong → reject" from the auto-approve view is deferred; the
  24h spot-check list + deep-link is the V1 surface (matches the risk-table ask).
- The **system user** has a profile at `/u/auto-moderator` (0 reports) but is linked
  from nowhere and excluded from no leaderboard (there isn't one). Accepted.
- Remaining: Day 9 (reconciliation worker — wires the sweep + matview/Typesense
  drift; regex blocklist editor — plugs into `nameLooksClean`; view-as-user), Day 10
  (runbook + ADR-0008). Evidence (Days 5–6) still paused on R2.

### Day 9 (partial) — reconciliation worker ✅ 🟢

The daily drift safety-net. New cron job `apps/worker/src/jobs/reconcile.ts`
(`reconcile` queue, scheduler `reconcile-daily`, cron `23 4 * * *` — clear of the
03:17 PII purge), wired into `apps/worker/src/index.ts` like the purge worker
(concurrency 1, own Queue handle owns the scheduler, closed on shutdown). One job
runs three idempotent wholesale reconciles in independent try/catch blocks:
1. `runAutoApprove(db)` — sweeps ALL pending taxonomy (the retroactive/scheduled
   entry the Day-8 inline hook + `pnpm … autoapprove` script foreshadowed).
2. `refreshAllAggregates(db)` — rebuilds every live aggregate matview cell.
3. `ensureCollections() → backfillAll(db, client)` — re-imports every
   report/company/topic doc into Typesense.

**Decisions / deferrals**
- These all have a primary lower-latency path (inline auto-approve on submit; the
  refresh-aggregate / index-typesense outbox consumers fed by NOTIFY + 30-min
  sweeps). Day 9's job is the BACKSTOP for what those miss (an inline hook that
  threw, a drifted cell, a doc a dropped event never wrote) — hence **daily**, not
  the outbox sweep cadence: a safety net shouldn't keep Neon awake (mirrors the
  scale-to-zero tuning).
- Passes run independently; a Typesense outage must not block the taxonomy +
  aggregate reconcile. Failures are collected and re-thrown as one `AggregateError`
  so BullMQ retries the whole job — safe because every pass is idempotent.
- Also fixed a duplicate `import { Queue, Worker } from "bullmq"` in index.ts.
- Verified: `@fromtheloop/worker` typecheck + lint clean.
- **Remaining in Day 9:** regex blocklist editor (plugs into `nameLooksClean`),
  view-as-user. Then Day 10 (runbook + ADR-0008). Evidence (Days 5–6) still on R2.

### Day 9 (partial) — regex blocklist editor ✅ 🟢

The editable slur/PII/spam blocklist, the second of the three "deviation" signals
the auto-approve plan named — and the one the Day-8 `nameLooksClean` header
explicitly reserved a plug-point for.

- **Schema.** New `regex_blocklist` table (migration `0022_puzzling_doctor_faustus.sql`,
  dev-applied) + `blocklist_category` enum (`slur|pii|spam|other`, display-only —
  every enabled row enforces identically). Columns: `pattern`, `label` (human
  description), `category`, `enabled`, `created_by_user_id` (FK users RESTRICT),
  timestamps. The row **is its own audit record** (created_by + timestamps), so
  blocklist edits write **no `mod_action_logs`** (mirrors `dismissFlags` being
  self-auditing) — no new `mod_action_type` verb needed.
- **DB (`moderation/blocklist.ts`).** CRUD (`list/add/setEnabled/remove`) +
  `nameMatchesBlocklist(db, name)` → matched label | null. **Hot-reload** via an
  in-process TTL cache (`BLOCKLIST_TTL_MS = 60s`): the inline suggest path doesn't
  re-query per submit, yet edits propagate without a redeploy. The web mutation
  actions call `invalidateBlocklistCache()` for instant in-process propagation;
  the worker picks changes up within the TTL. A row that no longer compiles is
  skipped, never fatal — one bad pattern can't take auto-approve down.
  `validateBlocklistInput` (shared shape) rejects blank/oversized/non-compiling
  patterns at write time. Patterns are admin-authored + trusted: compiled, **not**
  ReDoS-sandboxed (documented in module header + UI).
- **Auto-approve wiring.** Added a **4th signal** `nameAllowed` to
  `AutoApproveSignals` (distinct from `nameClean`, the fixed structural check).
  `evaluateAutoApprove` stays pure (adds `name-not-blocklisted` reason /
  `name-blocklisted` block); `runAutoApprove` computes it per candidate via the
  cached matcher. A blocklisted name is still *suggested* — it just lands in the
  human queue instead of self-promoting.
- **Web.** `app/admin/blocklist/` — `page.tsx` + `actions.ts` gated at
  **`requireAdmin()`** (stricter than the moderator floor the rest of /admin
  uses — editing what bypasses review is higher-trust). Client `BlocklistEditor`:
  add form (regex/label/category), per-row enable-disable + delete, and a **live
  tester** (type a sample name → see which enabled patterns it trips, compiled
  client-side from the same rows). New **Blocklist** nav tab, admin-only —
  generalized `admin-nav`'s `canSeeHealth` → `canSeeAdmin` (now gates Blocklist +
  Health together).
- **Verified.** db + web typecheck clean, web lint clean (pre-existing
  `theme-toggle` warning only). Added a `RegexBlocklistEntry.category` assertion to
  `types.test.ts`; documented the table + enum in `docs/data-model.md`. Throwaway
  probe (deleted) on controlled fixtures: validation matrix, cached match +
  hot-reload after disable, evaluator gate both ways, and **runAutoApprove
  end-to-end** — a verified submitter's blocklisted name held `pending` while a
  clean unique name promoted to `active`. **14/14 green**, zero residue (verified
  the table + probe users/companies all back to 0). Seeded 2 demo entries
  (`test/demo corp`, email-in-name PII) in dev for operator click-through.

**Decisions / deferrals**
- ⏭ **Reason not surfaced to the audit log** on a blocklist-blocked auto-approve —
  the matched label is computed but only gates; the row simply stays pending (no
  log written for a non-promotion, consistent with the unverified/near-dup blocks).
- ⏭ **Last Day-9 item: "view-as-user" read-only impersonation toggle.** Then Day 10
  (runbook + ADR-0008). Evidence (Days 5–6) still paused on R2.

### Day 9 (partial) — view-as-user read-only impersonation ✅ 🟢

The last Day-9 item: an admin can render a target user's private owner surface as
that user sees it, for debugging — **read-only and logged**, per the plan.

- **Two-layer read-only guarantee.** (1) It **never touches the Clerk session** —
  every write still resolves its actor via `currentUser()`, never the view-as
  cookie, so impersonation can never produce content *attributed to the target*.
  (2) On top of that, writes are *refused* while impersonating: middleware
  redirects the user-write routes (`/settings`, `/submit`, `/drafts`) to
  `/dashboard`, and the public report/comment write actions bail. `/dashboard` (the
  view-as surface) and `/admin` (so the admin can navigate out) stay reachable.
- **Mechanism (`lib/view-as.ts`).** An httpOnly cookie `ftl_view_as` holds the
  target's `users.id`. `getImpersonation(db)` is **admin-gated** — it re-checks the
  caller's role on every read, so a non-admin who hand-sets the cookie sees nothing
  impersonated (and the dashboard/banner fall back to normal). Short-circuits on
  the no-cookie common case before any auth/db cost. The cookie *name* lives in a
  dependency-free `lib/view-as-cookie.ts` so the **edge middleware** can import it
  without pulling in `next/headers` or the db package.
- **Audit (`view_as` mod_action_type, migration `0023_loud_echo.sql`, dev-applied).**
  `enterViewAs(targetId)` (admin-gated) writes a `view_as` `mod_action_logs` row
  (target = the user, metadata = their username) before setting the cookie — so the
  audit timeline shows who was impersonated, when. Mirrors updated everywhere the
  `Record<ModActionType,…>` exhaustiveness forces: `ModActionType`,
  `types.test.ts`, and the audit page's `ACTION_TONE`/`ACTION_LABEL` ("viewed as",
  neutral tone). Refuses self-impersonation. 1h cookie maxAge (a debugging session,
  not a standing grant). `exitViewAs()` clears it (no gate — ending impersonation is
  always safe and is the only way out for anyone holding the cookie).
- **UI.** A global `<ImpersonationBanner>` in the root layout (server component,
  renders null unless impersonating) — sticky accent bar, "Read-only — viewing as
  X", Exit button, pinned on every page. Entry point: an **admin-only** "👁 View as
  this user (read-only)" button on `/u/[username]`. The dashboard reads the target's
  drafts+reports when impersonating (its heading + copy switch to "X's work";
  draft Continue/Discard/Start affordances hidden — the reports list was already
  read-only).
- **Verified.** db + web typecheck clean, web lint clean (pre-existing
  `theme-toggle` warning only). Throwaway probe (deleted): a `view_as` log row reads
  back entity-scoped + in the global feed, action type + username metadata + mod
  join all correct — **6/6 green**, zero residue.

**Decisions / deferrals**
- **Read-only enforcement boundary.** Public report/comment writes are
  action-guarded; the user-write *routes* (settings/submit/drafts) are
  middleware-blocked, so their actions are unreachable via the UI while
  impersonating (a hand-crafted POST by the impersonating admin is the only gap —
  it would fire as the admin, not the target, so it can't violate the
  target-attribution guarantee; not separately guarded).
- ⏭ Impersonation only overrides the **dashboard** (the one private owner surface);
  `/u/[username]` is already public and `/settings` is intentionally blocked rather
  than mirrored. A broader "see every surface as them" was out of scope.
- ⏭ UI click-through left for the operator (MCP browser unauthenticated) — needs an
  admin session + a second user to view as.
- **Day 9 is now complete.** Remaining: **Day 10** (runbook `docs/runbooks/
  moderation.md` + ADR-0008). Evidence (Days 5–6) still paused on R2; reader-side
  content-flag "Report" button still an open follow-up.
