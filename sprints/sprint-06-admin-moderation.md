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
