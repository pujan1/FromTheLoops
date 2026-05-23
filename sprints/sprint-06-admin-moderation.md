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
| `docs/adr/0006-rbac-and-audit.md` | repo |

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
