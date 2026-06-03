---
status: accepted
date: 2026-06-03
deciders: [pujan]
---

# ADR-0004 — Submission validation, soft delete, and submission anti-abuse

## Context

Sprint 2 closes the submission loop: a draft becomes a persisted
`interview_report` tree. That terminal write needs three guarantees the draft
flow doesn't provide:

1. **Validation.** Drafts are deliberately tolerant (every field `.nullish()`
   so an in-progress form always autosaves). A finalized report must satisfy
   strict cross-field rules (a round needs a type + rating; a question needs
   non-blank prose + ≥1 *active* tag; pending tags don't count).
2. **Deletion that preserves the audit trail.** `interview_reports` uses
   `created_by_user_id ON DELETE RESTRICT` (PLAN.md §230 hygiene) — a report is
   the audit record of who said what. Users still need to retract a report, and
   we still need to honor data-minimization (don't keep a deleted user's free
   text forever).
3. **Abuse control on the only data-creation surface.** Finalize is the heaviest
   write and the one whose output becomes user-visible content. Beyond the
   account-boundary Clerk captcha and the form honeypot, it needs per-user
   throughput limits and a content gate against contact-info/PII dumping.

This ADR records the decisions for all three; they were built together in
Sprint 2 Days 4–8.

## Decision

**Validation** is a single pure gate, `validateFinalSubmission` in
`@fromtheloop/shared`. It re-parses the raw draft with the tolerant schema, then
applies the strict rules *in code* (not Zod refinements — clearer for
cross-field/per-index rules) and returns either a narrowed `FinalSubmission` or
a structured, index-aligned `SubmissionIssues` map the form renders inline.
`finalizeSubmission` (core) re-runs it server-side and never trusts a
client-validated payload.

**Soft delete** flips `interview_reports.status = 'deleted'` and stamps
`deleted_at = now()`; the row and its children stay. `isReportEditable` and
every read surface treat `deleted` as gone. A **90-day PII purge** worker job
(`apps/worker`, daily cron via a BullMQ JobScheduler) clears the free text of
reports deleted longer than `PII_RETENTION_MS` — round `experience_prose` → NULL,
question `question_prose` → `''` (the column is NOT NULL, so empty string is the
redaction) — and stamps `pii_purged_at` so re-runs are no-ops.

**Anti-abuse** at finalize is three layers:
- **Sliding-window rate limit** (Redis sorted set) for the 10/day submission cap
  — no midnight-boundary doubling. The cheap, generous budgets (autosave,
  taxonomy suggestions) stay on the existing fixed-window counter.
- **1 report / company / user**, enforced as a **durable DB check**
  (`userHasReportForCompany`), not a Redis window — it's a standing invariant,
  not a time box, and must survive a Redis flush. Soft-deleting frees the slot.
- **Regex block list** (`@fromtheloop/core` `anti-abuse/regex.ts`) scanning every
  free-text field. Two severities: contact info + PII (phone/email/SSN) are
  **block** (hard-reject at finalize); profanity is **flag** (returned for
  moderation logging, *not* rejected). Identity slurs belong in the block list
  but the curated word list is maintained operationally, out of source history.

## Alternatives considered

| Option | Why not |
|---|---|
| Hard-delete on user retract | Violates the RESTRICT audit-trail design; loses moderation/dispute history. |
| Null free text immediately on soft delete | No appeal/audit window; a misclick is irrecoverable. 90 days balances minimization vs. recoverability. |
| Make `question_prose` nullable for the purge | Heavier schema/type churn for a field the app always requires on write; `''` redaction is sufficient for a row only admins can see. |
| Per-company cap as a Redis counter ("Redis-backed", per sprint copy) | A permanent 1/company cap is a uniqueness invariant, not a window; a counter would reset on flush/expiry. DB count is correct and cheap (indexed by `created_by_user_id`). |
| Fixed-window for the submit cap | Lets a user fire 10 at 23:59 + 10 at 00:01. Sliding window closes that for the one surface where it matters. |
| Hard-reject profanity too | Sprint risk note: candor is the product. "The interviewer was an ass" is a legitimate review; blocking it is worse than allowing it. Flag-and-log instead. |
| Zod refinements for the finalize rules | Cross-field + per-index ("each question needs ≥1 active tag") read far clearer as imperative code than chained refinements. |

## Consequences

### Positive
- One server-side validation authority; the form's inline errors and the
  finalize gate can never disagree.
- Deleted reports stay auditable for 90 days, then self-scrub — minimization
  without losing the moderation trail.
- Tight, shape-based regexes (digit runs / `@`-addresses, never the words
  "phone"/"email") keep false positives off legitimate technical prose.

### Negative
- The per-company cap and the block list only surface on Submit (the live form
  doesn't pre-check them), so a user can hit them late. Acceptable: both are
  rare and the messages are specific.
- The purge depends on the worker's cron actually running; a stalled worker
  silently delays scrubbing. Monitored via the same Sentry path as other jobs.
- Profanity flagging currently only logs — there's no moderation queue surface
  for flags until Sprint 6.

### Neutral / open
- "Admin override" for the per-company cap is noted but unbuilt (no admin RBAC
  until Sprint 6).
- The block list is a tuning surface: the risk note's "log rather than
  hard-reject, tune later" applies. Sprint 6 mod tooling owns expanding it
  (incl. the operational slur list) and adding a review queue.
- Levels still populate both `level` (text, wedge index) and `level_id`; the
  text→FK cutover + its `query-plan.test.ts` migration remain deferred.

## References

- `sprints/sprint-02-submission-deep.md` (scope, exit criteria, risk notes)
- PLAN.md §230 hygiene (soft-delete + RESTRICT FKs), §Data model
- [ADR-0002](0002-orm-drizzle.md) (Drizzle migrations), [ADR-0003](0003-i18n-url-contract.md)
- `packages/shared/src/submission.ts`, `packages/db/src/reports.ts`,
  `packages/core/src/reports/submit.ts`, `packages/core/src/anti-abuse/regex.ts`,
  `apps/web/lib/rate-limit.ts`, `apps/worker/src/jobs/purge-deleted-pii.ts`
