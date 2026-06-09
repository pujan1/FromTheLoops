---
status: accepted
date: 2026-06-08
deciders: [pujan]
---

# ADR-0007 — Karma design: recompute-from-scratch earn, flagger-weighted ranking, no submitter boost

> Sprint 5 deliverable (the skeleton called it "ADR-0005", but 0005 is already
> the aggregation strategy — this is the next free number). Records the karma
> system as built across Sprint 5 Days 7–10 (`packages/db/src/karma.ts`,
> `helpful-flags.ts`, migrations 0014–0015) so the rules and — more importantly —
> the deliberate non-goals aren't reverse-engineered later.

## Context

Karma ties contribution to a visible, account-bound reputation. PLAN.md §Karma
fixes the shape but leaves the engineering open:

- **Earn**: submission base (5 unverified / 10 verified-pro / 25 recruiter-confirmed)
  plus helpfulness flags from readers.
- **Effect**: vanity tier badges (10 / 100 / 1000) and a "helpful-flag-weighted
  aggregation ranking".
- **A hard non-goal**: *no karma-affects-search-ranking-of-the-submitter* — the
  rich-get-richer trap, called out explicitly in PLAN.md.

Three forces shape the design:

1. **Anonymity is display-only** (PLAN.md §Anonymity, ADR-0004's soft-delete
   hygiene). Karma is account-bound; a report posted anonymously still earns for
   its author but never reveals them. So karma can't be derived from anything
   public-facing — it must read from `created_by_user_id`, which is always set.
2. **Abuse surface**: helpful-flags are a sock-puppet vector (sprint risk table).
3. **Consistency**: the aggregate/search pipelines already use an idempotent
   "recompute the affected unit on an event" model (ADR-0005). Karma should not
   invent a second, divergent consistency story.

## Decision

**Karma is a denormalized cache on `users.karma`, recomputed from scratch — never
incremented.** `recomputeUserKarma(userId)` rebuilds the whole figure from the
source of truth (the user's reports + the helpful-flags on them) in one
transaction; it is fully idempotent.

- **Earn** = Σ over the author's non-deleted reports of a base award
  (`5` unverified / `10` verified-pro; `25` recruiter-confirmed is wired but
  deferred until Layer-3 per-report evidence has storage in Sprint 6) **+** `1`
  per helpful-flag on those reports **from another verified, non-self user**. A
  report's tier and a flag's validity are read *live* (from `user_verifications`)
  at recompute time, so karma self-heals when verification state changes.
- **Triggering**: report writes drive recompute through the existing events
  outbox as a third consumer (`recompute-karma` worker job, debounced per user).
  Helpful-flag writes recompute the author **inline** in the web action — flags
  aren't report-cell changes, so routing them through the outbox would needlessly
  fire the aggregate + search consumers; inline keeps the +1 instant.
- **Tier badges** (`Contributor` 10 / `Established` 100 / `Distinguished` 1000)
  are a pure presentation mapping (`karmaTier` in `@fromtheloop/core`), derived
  from the number, never stored.
- **Ranking**: report lists order by a **karma-weighted helpful-flag signal**,
  recency as the tiebreak. The weight is the **flagger's** karma
  (`Σ GREATEST(flagger.karma, 1)` over valid flags), **never the submitter's**.
  Unflagged reports score 0, so they keep newest-first order; the signal only
  *lifts* reports that readers endorsed.

**The submitter's own karma influences nothing about how their content ranks or
is searched** — not the list order, not the aggregate volume, not Typesense. Only
*other people's* endorsements (flagger-weighted) move a report up.

## Alternatives considered

| Option | Why not |
|---|---|
| Increment/decrement karma on each event | Drifts on any missed/duplicated event; no way to audit "is this number right?". Recompute-from-scratch is self-correcting and trivially idempotent — the ADR-0005 stance. |
| Let the submitter's karma boost their own report's ranking/search | The explicit PLAN.md non-goal — rich-get-richer entrenches early users and punishes good reports from new accounts. Weighting by the *flagger* instead rewards content quality, not author seniority. |
| Route helpful-flags through the events outbox | The outbox is report-cell shaped (company/role/level); a flag isn't a cell change. It would force needless aggregate + search recomputes and muddy the event semantics. Inline recompute is cheaper and instant. |
| Weight each flag equally (plain count) | Ignores that a flag from an established, verified contributor is a stronger quality signal than one from a brand-new account — and a flat count is a softer sock-puppet target. `GREATEST(karma,1)` keeps every flag ≥1 while letting trust accrue. |
| Store the tier on the row | Pure derivation from the number; storing it just adds a second thing to keep in sync. |

## Consequences

### Positive
- One idempotent recompute is the whole consistency story; a backfill, a retry,
  or a double-fire all converge on the same value.
- The anti-abuse rules (no self-flag, verified-only, 50/day) live in one place and
  the recompute re-checks flagger validity, so a stale flag can't keep earning.
- The submitter-boost trap is structurally impossible: the ranking SQL never reads
  the author's karma.

### Negative
- The ranking adds a per-row LATERAL subquery to `runReportList` (the hot browse
  query). Acceptable at current scale; if it shows up in query-plan budgets we'd
  precompute a per-report `helpful_score` column maintained on flag writes
  (the same denormalization move karma itself makes).
- Recompute-from-scratch is O(reports + flags) per user. Fine for individual
  accounts; a pathological mega-contributor would want an incremental path, but
  that's a far-future problem.

### Neutral / open
- **Recruiter-confirmed (25)** is unreachable until Sprint 6 adds Layer-3 evidence
  storage; the constant and the CASE branch are ready for it.
- **Rate-limit window** is a rolling 24h counting standing flags; a determined
  actor can churn flag/unflag to evade the cap. Good enough for V1; a true action
  log would close it.
- Karma is **public** on profiles even for accounts that only post anonymously —
  intended (the number is account-level, the *reports* stay anonymous), but worth
  revisiting if users read it as deanonymizing.

## References

- PLAN.md §Karma, §Trust & verification (3-layer model + tier weights), §Anonymity
- `sprints/sprint-05-topics-profiles-karma.md` (Days 7–10)
- ADR-0004 (validation & soft-delete — account-bound audit trail)
- ADR-0005 (aggregation strategy — the recompute-on-event model karma mirrors)
- `packages/db/src/karma.ts`, `helpful-flags.ts`; migrations `0014_user_karma`,
  `0015_helpful_flags`; `packages/core/src/karma/tier.ts`
