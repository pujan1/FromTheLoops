# Sprint 2 — Rounds, Questions, Validation, Soft Delete

> **Weeks 5–6**

## Goal

Complete the submission flow: users can add rounds, questions, and topic tags; submissions are validated, persisted, editable for 24h, and soft-deletable.

## Why now

Sprint 1 stopped at "Continue → Rounds". This sprint closes the loop so a report is a real, fully-formed record — the input to every read surface from Sprint 3 onward.

## In scope

- Per-round collapsible cards (UI)
- Round fields: `round_type` (enum), `questions[]`, `experience_prose`, `rating` (positive/mixed/negative)
- Question fields: `question_prose`, `topic_tags[]` (≥1 required, from curated set; "suggest new tag → pending")
- Topic-tag taxonomy table with `status` column; seed ~80 tags across SWE/ML/data/SRE
- Validation rules:
  - At least 0 rounds allowed (some reports are just "got rejected at recruiter screen, no detail")
  - But: if `rounds.length > 0`, each round must have `round_type` + `rating`
  - Each question requires ≥1 active tag (pending tags don't count toward this until promoted)
- Submission finalization: writes `interview_report` + `rounds` + `questions` + `report_tags` join rows in a single transaction
- 24h edit window logic (`reports.locked_at = created_at + 24h`)
- Soft delete: `reports.status = 'deleted'`, PII fields nulled after 90 days via worker job
- Submission confirmation email (Resend) — V1's only notification
- Rate limit: 10 submissions/day/user; 1 submission/company/user without admin override (Redis-backed)
- New-user 24h moderation hold (drops after 3 verified submissions)
- Slur / PII / contact-info regex blocks at submission time

## Out of scope

- Aggregation (Sprint 3)
- Search indexing (Sprint 3)
- Display of submitted reports anywhere (Sprint 4)
- Trust-evidence upload UI (Sprint 6, gated by admin queue)
- Karma earn on submission (Sprint 5)

## Deliverables

| Artifact | Where |
|---|---|
| Per-round collapsible cards w/ keyboard-navigable add/remove | `apps/web/components/submit/` |
| `topic_tags` table + seed (~80 tags) | `packages/db/` |
| Submission transaction (`packages/core/reports/submit.ts`) | repo |
| Soft-delete + 90-day PII purge worker job | `apps/worker/jobs/purge-deleted-pii.ts` |
| Confirmation email template | `apps/web/emails/submission-confirmed.tsx` |
| Rate-limit middleware (Redis sliding window) | `packages/core/anti-abuse/` |
| Regex block list (slur, PII like SSN/phone, contact info) | `packages/core/anti-abuse/regex.ts` |
| `docs/adr/0002-validation-and-soft-delete.md` | repo |

## Exit criteria

- [ ] User can complete a full report (top-level + ≥1 round + ≥1 question + ≥1 tag) and submit successfully
- [ ] Report row, rounds, questions, and tag joins all present after submission; verified with a SQL query
- [ ] Within 24h of submission, user sees "Edit" CTA; after 24h, only "Soft delete" remains
- [ ] Soft delete sets `status = 'deleted'`; data still in DB, not visible to anyone but admin
- [ ] Cron / worker runs 90-day PII purge on a fixture row and clears free-text fields
- [ ] Confirmation email arrives within 60s of submission (test on personal email)
- [ ] 11th submission in 24h is rejected with a friendly message
- [ ] Submitting "call me at 555-1234" is rejected with the regex block

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Per-round UI gets heavy / janky as users add 5+ rounds | RSC + minimal client component per card; measure with React profiler before optimizing. |
| Regex false positives on legitimate technical content (e.g., "implement a `phone` field") | Start permissive; log blocks to a queue table for review rather than hard-reject; tune in Sprint 6 mod tooling. |
| Single submission transaction grows slow with many rounds/questions | Cap at 20 rounds, 30 questions/round (well over realistic max); document in form copy. |

## Dependencies

- Sprint 1 exit criteria met
- `pg_trgm` index from Sprint 1 reused for tag autocomplete

## Day-by-day skeleton

| Day | Focus |
|---|---|
| 1 | Round/question/tag schema migrations; topic-tag seed |
| 2 | Per-round card UI; add/remove rounds & questions |
| 3 | Tag combobox (reuse Sprint 1 component); "suggest new tag" path |
| 4 | Validation layer (Zod, server-side); error UX |
| 5 | Submission transaction; integration test |
| 6 | 24h edit window + edit UI (same form, prefilled) |
| 7 | Soft delete + PII purge worker job + cron schedule |
| 8 | Rate-limiting middleware + regex block list |
| 9 | Confirmation email; new-user hold logic |
| 10 | E2E happy path + abuse-path tests; exit-criteria walkthrough |

## Notes & decisions

_Append-only._
