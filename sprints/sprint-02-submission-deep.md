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

- 2026-06-02: **Sprint 1 handoff / prep notes** (written at Sprint 1 Day 10). Read before starting.
  - **Reuse, don't rebuild:**
    - `<Combobox>` (`apps/web/components/ui/combobox.tsx`) is the tag input (Day 3). Pass `onSuggestNew` to get the suggest-new-tag row (companies use it; roles don't). Hidden `name` prop posts the selected id in a plain form. Debounced async `search` prop — point it at a new `/api/taxonomy/tags` lookup.
    - The taxonomy lookup pattern is set: `searchCompanies`/`searchRoles` + `pg_trgm` GIN indexes + the `taxonomy_aliases_text()` IMMUTABLE wrapper (migration 0002). Mirror it for `searchTopicTags`. At ~80 tags the planner will still pick the btree/status filter over the trigram index (same as companies at 30 rows) — assert timing + index existence, **not** a forced query plan.
    - **Suggest-pending is wired and is your template.** Sprint 1 Day 10 added `suggestPendingCompany` (server action) → `suggestCompany` (db, idempotent on slug, inserts `status='pending'`/`source='user_suggested'`, attributes `suggestedByUserId`). Build `suggestTag`/`suggestPendingTag` the same way. The "≥1 active tag per question; pending tags don't count until promoted" rule = the active-vs-pending distinction already modeled for companies (`existing` vs `suggested` in `companySelectionSchema`).
    - **Anti-abuse** currently = honeypot in `packages/shared/src/anti-abuse.ts` (pure `isHoneypotTripped`, silent-drop pattern) + account-boundary Clerk captcha. This sprint adds Redis rate-limit + regex blocks in `packages/core/anti-abuse/`. The honeypot's **fail-closed-without-tipping-off** shape is the model for how the rate-limit/regex paths should reject. Keep the honeypot where it is (pure, dep-free) unless `core` needs it too.
    - **E2E harness is ready to extend** (`apps/web/e2e/`, Day 9): Playwright + `@clerk/testing`, system Chrome (`channel:"chrome"`, no browser download), `clerkSetup()` testing-token bypass of the sign-up Turnstile, email-ticket sign-in, idempotent `+clerk_test` user, `CLERK_TELEMETRY_DISABLED=1` so the worker exits. Add the Sprint 2 Day 10 happy-path + abuse-path specs here. Note the gotcha: a native `<select>` resolves via `page.locator("select")`, not `getByLabel` (Chromium folds the aria-hidden `*` into the implicit-label name).
    - **Draft persistence** (`submission_drafts.data` jsonb + `submissionDraftSchema`, everything `.nullish()`) is the autosave substrate — extend the schema with `rounds[]`/`questions[]`/`tags[]`; the 2s debounce + resume route already work.
  - **Schema cutovers you own this sprint:**
    - `interview_reports.level_id` (FK → `company_levels`, nullable) was added Day 1 **alongside** the legacy text `level` (still NOT NULL); no reports were written in Sprint 1. The wedge index `reports_company_role_level_idx` is on **text `level`** and is asserted by `query-plan.test.ts`. When the finalization transaction first writes reports, decide the text→FK cutover (populate both, or migrate the index + its test). This is the deferred decision from Day 1.
    - **Draft → report finalization** must resolve the draft's company to a real id: a draft may still hold a `kind:"suggested"` company (name only) if the user never hit Continue, or a backfilled `existing` id if they did. Re-run `suggestCompany` (idempotent) during finalization to be safe — Sprint 1 deliberately does **not** force-persist the backfilled id into the draft before navigating. Same resolve-on-finalize pattern applies to suggested tags.
  - **ADR numbering:** this file's deliverables list says `docs/adr/0002-validation-and-soft-delete.md`, but **0002 is taken** (ORM choice). The ADR roadmap (`docs/adr/README.md`) reserves **0004** for "Validation rules and soft-delete semantics" — write **ADR-0004**. (Day 7's i18n ADR took 0003.)
  - **i18n:** all copy lives in `messages/en.json` (next-intl, single-locale no-prefix — ADR-0003). The `rounds` namespace already exists (Sprint 1's stub) — expand it; add a `questions`/`tags` namespace. Server components use `getTranslations`, client `useTranslations`; rich text via `t.rich`, dynamic labels via template keys (`t(\`outcome.${o}\`)`).

- 2026-06-02: **Days 1–2 done** (schema/seed + per-round UI). 79 db tests + 4 shared tests green; web typecheck + prod build clean.
  - **Day 1 — topics taxonomy.** Extended the `topics` table to mirror companies/roles: added `aliases`, `status` (default `active`), `source` (default `user_suggested`), `suggested_by_user_id` (FK→users, SET NULL), + `topics_status_idx`. Migration **0003** (drizzle-generated columns) + **0004** (hand-written trgm indexes `topics_name_trgm_idx` / `topics_aliases_trgm_idx`, mirroring 0002 — pg_trgm + `taxonomy_aliases_text()` already exist from 0002). 0004 was wired into the journal + a meta snapshot copied from 0003 (new `id`, `prevId`→0003), same pattern 0002 used; `drizzle-kit generate` now reports no pending diff. Seeded **88** curated topics (`CURATED_TOPICS`) across algorithms/system-design/fundamentals/ML/data/SRE + behavioral (test asserts the ≥80 floor, not an exact count). Added `searchTopics` + `suggestTopic` to `packages/db/src/taxonomy.ts` — topics are the *second* suggest-new taxonomy (roles still closed). **`/api/taxonomy/topics` route + the tag combobox are Day 3** (not built yet).
  - **Day 2 — per-round card UI.** Extended `submissionDraftSchema` with `rounds[]` (each round: `roundType`/`rating`/`experience` + `questions[]`; each question: `prose` + `tags[]` via `topicTagSelectionSchema`, the existing-vs-suggested union mirroring company). All `.nullish()` so pre-Sprint-2 drafts still parse. Added caps `MAX_ROUNDS=20` / `MAX_QUESTIONS_PER_ROUND=30` + `topicSuggestionSchema` (for the Day 3 action). New `RoundsForm` client component (`apps/web/app/submit/rounds/rounds-form.tsx` + `.module.css`): collapsible cards, keyboard-navigable add/remove rounds & questions (focus moves to new card / back to add-button on remove), per-round type select + rating chips + experience textarea, per-question prose textarea. **Tag input is a placeholder hint** (`tags.comingSoon`) — Day 3 drops in the `<Combobox>`. Question `tags[]` currently serialized as `[]`.
  - **Draft continuity decision.** The basics form's Continue now **persists the draft synchronously** and forwards its id as `/submit/rounds?draft=<id>` (the 2s autosave can't be relied on for a fast Continue). The rounds page is ownership-scoped via `getDraft` (no draft id → redirect `/submit`; foreign id → 404). To avoid clobbering, the basics form's draft payload **passes through `initialData.rounds`** (it doesn't edit them), and `RoundsForm` saves `{...initialData, rounds}` so basics survive a rounds-only save. The "Back to basics" link points at `/drafts/<id>` (full RSC reload re-hydrates latest rounds).
  - **Still deferred to Day 5 (unchanged):** the `interview_reports` text-`level` → `level_id` FK cutover + the `reports_company_role_level_idx` / `query-plan.test.ts` migration. No reports are written yet, so untouched. Resolve-on-finalize (idempotent `suggestCompany`/`suggestTopic`) for any `kind:"suggested"` company/tag still applies at the transaction (Day 5).

- 2026-06-03: **Days 3–4 done** (tag combobox + suggest-new path; finalize validation layer + inline error UX). All tests green (shared 28, db 79), web typecheck + lint + prod build clean. Verified Days 1–2 still green first.
  - **Day 3 — tag combobox.** New `/api/taxonomy/topics` route mirrors `/companies` (suggest-new ON; `canSuggestNew` when a non-empty query has no active match). Client `searchTopics` in `rounds-form/api.ts` returns the full `{id,slug,name}` match (the picker needs the slug to build an `existing` selection — the combobox option only carries id+label). New `suggestPendingTopic` server action mirrors `suggestPendingCompany` exactly (rate-limited via new `RATE_LIMITS.suggestTopic` = 20/hr, honeypot → `actionOk(null)`, idempotent `suggestTopic`, returns id/slug/name). **Multi-select:** added a `clearOnSelect` prop to `<Combobox>` — on pick/suggest it clears the input and stays open/focused instead of mirroring the label, so several tags can be added without remounting (no focus loss). New `rounds-form/tag-picker.tsx` wraps that combobox + removable `FtlTag` chips; the parent owns `TopicTagSelection[]`, combobox stays `value=null`. Dedupe by id (existing) / case-folded name (suggested); suggested chips render a muted "pending" affordance. Wired tags through the rounds state: `Question.tags`, `newQuestion`, `from/toDraftRounds` (was serializing `[]`), `patchQuestionTags` in the form, `onPatchQuestionTags` into `RoundCard`. Replaced the Day-2 `tags.comingSoon` placeholder with the live picker; `tags` i18n namespace reworked (label/placeholder/empty/suggestNew/selectedLabel/pending/remove).
  - **Day 4 — validation layer.** `validateFinalSubmission(data: unknown): SubmissionValidation` in `packages/shared/src/submission.ts` is the single server-side finalize gate (Day 5's transaction will call it before writing). Re-parses the payload with the tolerant `submissionDraftSchema`, then applies the strict rules **in code** (clearer than Zod refinements for cross-field/per-index rules): 0 rounds OK; a round needs `roundType`+`rating`; a question needs non-blank prose + **≥1 *active* (existing)** tag — a pending/suggested tag does **not** count (matches the searchTopics active-only filter). Returns either the narrowed `FinalSubmission` (trims prose, blank experience → null) or a structured `SubmissionIssues` (per-field booleans + per-round/per-question arrays, index-aligned with the form) for inline rendering; a non-parseable payload → `{malformed:true}`. 12 new shared tests cover every rule incl. the suggested-tag-doesn't-count case. **Error UX:** the rounds form computes `validateFinalSubmission({...initialData, rounds})` live (memoized) and threads each round's issues into its `RoundCard`; cards show inline errors under the type select / rating chips / question prose / tags — but **held back for pristine cards** (`roundIsPristine`/`questionIsPristine`) so a freshly-added round/question isn't pre-emptively flagged. Basics-field issues are computed but not rendered here (they belong to the prior screen).
  - **Deferred to Day 5 (unchanged):** the text-`level`→`level_id` cutover + query-plan test migration; the actual Submit button + finalize transaction (which will call `validateFinalSubmission` server-side, then resolve-on-finalize the suggested company/tags via idempotent `suggestCompany`/`suggestTopic` and write `interview_report`+`rounds`+`questions`+`report_tags` in one transaction).
