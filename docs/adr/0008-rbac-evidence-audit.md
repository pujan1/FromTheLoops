---
status: accepted
date: 2026-06-29
deciders: [pujan]
---

# ADR-0008 — RBAC, evidence storage, and the moderation audit log

> Sprint 6 deliverable (the sprint plan's §Deliverables miscalls this `0006`; the
> ADR index reserved **0008** — that's the number). Records the three load-bearing
> design decisions behind the admin panel built across Sprint 6 Days 1–9, so the
> rules — and the deliberate non-goals — aren't reverse-engineered later. The
> day-to-day operator view is the companion `docs/runbooks/moderation.md`.

## Context

V1 opens with a single moderator (the operator). PLAN.md §Moderation operations
budgets **30–45 min/day at alpha** and fixes the shape — a Clerk-metadata role
enum, a `mod_action_log` audit table, 7 tabbed queues — but leaves three
engineering questions open, each with a trap:

1. **Who can moderate, and how is that enforced?** It must fail *safe* (a
   misconfigured session can't silently grant access), must not leak the
   existence of the admin surface to a logged-in non-admin, and must not require a
   second source of truth alongside Clerk.
2. **Where do trust-evidence images live, and who can see them?** Recruiter-Confirmed
   proof is the highest-value trust signal (it lights the ✓✓ badge and is worth 25
   karma) but it's also **PII that must never leak** — the image is for the mod's
   eyes only and has to be purgeable.
3. **How is every moderator action recorded?** Section 230 hygiene means every
   *removal* needs a logged justification, and the log has to be trustworthy
   (append-only, attributable) without becoming a second consistency story to keep
   in sync.

Two prior commitments constrain all three: auth already runs on Clerk (ADR-0001),
and the codebase already removes content **softly** with a 90-day PII purge
(ADR-0004) — moderation must not invent a divergent deletion or consistency model.

## Decision

### 1. RBAC — a Clerk-metadata role ladder, gated page-side as a 404

A strictly-increasing four-tier ladder, `user < moderator < admin < super_admin`
(`apps/web/lib/roles.ts`), with `roleAtLeast(role, min)` so every check is
inclusive upward. **The source of truth is Clerk `publicMetadata.role`**, surfaced
to the app through a custom session-token claim — never a `users.role` column
(that stays deferred; auth reads Clerk, not Postgres). On top of that sits a
**break-glass `ADMIN_CLERK_IDS` env allowlist** that resolves to `super_admin`
unconditionally — it bootstraps the first admin and guarantees a way in if the
session-token claim is ever misconfigured.

Enforcement is **two layers** (`apps/web/lib/admin.ts`): `middleware.ts` requires a
signed-in session for `/admin(.*)`, then `requireRole(min)` on the page/layout
calls **`notFound()`** — a **404, not a 403** — for the under-privileged, so the
route never advertises its own existence. The `/admin` layout gates the whole area
at the moderator floor (defence-in-depth over each page's own guard); the
Blocklist + Health surfaces additionally require `admin`.

### 2. Evidence storage — a separate `report_evidence` table, R2 with signed URLs, mod-only, auto-purged

Per-report trust evidence lives in a **new `report_evidence` table** (report_id,
uploaded_by, r2_key, content_hash, mime, status, reviewed_*, purge_at) — kept
**separate from `user_verifications`** (that's the user→company work-email layer;
this is per-report and flips `reports.evidence_verified` → ✓✓). Bytes go to a
**private Cloudflare R2 bucket**, written by a presigned PUT and read by mods only
through short-lived signed GET URLs; access is logged and the object **auto-purges
14 days after review**. Upload attaches **post-submit on the report page** (the
report already has an id), not inline in the submit form. Approving an evidence row
sets `evidence_verified = true` and the trust badge recomputes.

**Status: designed and locked, not yet built.** Days 5–6 are **paused on a
Cloudflare R2 billing failure** (subscription stuck in a redirect loop; bucket
couldn't be created). The evidence queue is the one queue that renders but is
unwired. This ADR records the locked design so the build resumes without
re-deciding; if R2 stays blocked the fallback is Vercel Blob behind the same table
+ presign interface.

### 3. Audit log — one append-only `mod_action_logs` table, written in the same transaction as the action

Every moderator action writes a row to **`mod_action_logs`** (mod_user_id,
action_type, target_type, target_id, reason, metadata, created_at) via a single
helper, `logModAction()`, **inside the same transaction as the mutation it
records** — so an action and its log row commit or roll back together; there is no
"acted but unlogged" state. `action_type` is an enum
(`approve | reject | merge | ban | delete | hide | edit_taxonomy | restore |
view_as`). `reason` is **required for every removal** (reject, hide), enforced at
the UI and re-checked server-side. The table is **append-only** and is its own
source of truth — it is *not* recomputed from anything, which is the one place the
codebase's recompute-from-events model (ADR-0005/0007) deliberately doesn't apply,
because an audit trail you can rebuild is an audit trail you can rewrite.

Two deliberate carve-outs write **no** `mod_action_logs` row, because the mutated
row is *already* self-auditing: dismissing a community flag (the `content_flags`
row carries `resolved_by`/`resolved_at`) and editing the blocklist (the
`regex_blocklist` row carries `created_by` + timestamps). Auto-approvals **do**
log, attributed to a reserved **"Auto-moderator" system user** (`mod_user_id` is
`NOT NULL`), with `metadata = { auto: true, reasons }` to distinguish them.

## Alternatives considered

| Option | Why not |
|---|---|
| Store roles in a `users.role` Postgres column | A second source of truth to keep in sync with Clerk, and an extra DB round-trip on every auth check. Clerk metadata + a session claim is authoritative and free at request time. Revisit only if a queue needs to *filter* by a submitter's role without a Clerk lookup. |
| Return **403** for under-privileged `/admin` hits | Confirms the route exists. **404** leaks nothing — the surface is invisible to anyone who can't use it. |
| RBAC purely in middleware (no page-side guard) | Middleware can't cleanly express "moderator floor here, admin floor there" per-surface, and a single edge check is a single point of failure. Page-side `requireRole()` + the middleware session gate is defence-in-depth. |
| Evidence images in Postgres (bytea) or a public bucket | Postgres bloats and bytea is the wrong tool for blobs; a public bucket leaks PII by URL. Private R2 + signed, expiring URLs + 14-day purge is the only option that keeps proof mod-only and disposable. |
| Fold evidence into `user_verifications` | Different grain (per-user vs per-report) and different lifecycle (standing trust vs a one-time, purgeable artifact). Conflating them would couple two unrelated purge/review flows. |
| Increment/derive the audit log, or allow edits | An audit trail that can be recomputed or edited isn't an audit trail. Append-only, written in-transaction, is the whole point. |
| Log dismiss/blocklist edits too (uniformity) | Those rows already record who/when/why on themselves; a second log row would duplicate the record and imply the action removed content (it didn't). |

## Consequences

### Positive

- **Fails safe.** A missing/garbled session claim resolves everyone to `user`, not
  to elevated access; the env allowlist is the only standing grant and it's
  explicit. A misconfiguration is a lockout (recoverable via break-glass), never a
  privilege leak.
- **The admin surface is invisible** to anyone who can't use it (404, not 403).
- **No action can run unlogged** — the log write shares the action's transaction —
  and the log can't be quietly rewritten (append-only, in-DB, attributable,
  including auto-approvals via the system user).
- **Evidence PII is contained by construction:** private bucket, expiring signed
  URLs, mod-only reads, 14-day auto-purge — and it's decoupled from the user-trust
  layer.

### Negative

- **RBAC depends on a manual Clerk Dashboard step** (the session-token customization
  that ships the `metadata.role` claim). Until it's done, *only* the env allowlist
  grants access — safe, but a foot-gun if forgotten. Documented in the runbook
  prereqs and `lib/roles.ts`.
- **Evidence is shipped-incomplete.** The ✓✓ Recruiter-Confirmed path — and the
  25-karma award that ADR-0007 wired but deferred — stays dark until R2 (or the
  Vercel Blob fallback) is unblocked. One of the 7 queues is non-functional at
  launch.
- The audit log grows unbounded and append-only; fine at alpha volume, but it has
  no retention/rollup story yet (see open).

### Neutral / open

- **`users.role` may still arrive** if queue UIs need to show/filter a submitter's
  role without a Clerk round-trip — it'd be a denormalized cache of the Clerk
  metadata, not a new source of truth.
- **Heuristic auto-approve trusts "verified submitter" only.** PLAN.md named
  "domain valid" as a signal, but V1 user-suggested companies carry no domain to
  validate; a captured domain becomes a later signal. A karma-threshold path for
  established-but-unverified submitters is also possible later. (The editable
  blocklist is already wired in as the second auto-rule signal.)
- **Audit-log retention** (purge/rollup of ancient rows) is unspecified — revisit
  when the table size warrants it or when legal retention rules are pinned down.
- **View-as impersonation is read-only by two guarantees** (writes always resolve
  the actor via Clerk, never the impersonation cookie; and write routes are blocked
  while impersonating). A hand-crafted POST by the impersonating admin would fire as
  the admin, not the target — so it can't violate target-attribution — and is not
  separately guarded.

## References

- PLAN.md §Moderation operations (load forecast, 7 queues, RBAC enum), §Trust &
  verification (3-layer model, ✓✓ recruiter-confirmed), §Anonymity
- `sprints/sprint-06-admin-moderation.md` (Days 1–10, the append-only notes log)
- `docs/runbooks/moderation.md` (the operator-facing daily cycle)
- ADR-0001 (stack — Clerk auth, R2), ADR-0004 (soft-delete + PII purge),
  ADR-0005 (recompute-on-event consistency — which the audit log deliberately
  does *not* follow), ADR-0007 (karma — the deferred 25-point recruiter-confirmed
  award this evidence path unlocks)
- `apps/web/lib/roles.ts`, `apps/web/lib/admin.ts`, `apps/web/lib/view-as.ts`;
  `apps/web/app/admin/`; `packages/db/src/schema/moderation.ts`,
  `packages/db/src/moderation.ts` (+ `moderation/flags.ts`, `auto-approve.ts`,
  `blocklist.ts`); enum `mod_action_type` in `packages/db/src/schema/enums.ts`
