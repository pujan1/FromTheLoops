# Sprints

8 × 2-week sprints to alpha (~16 weeks). Solo dev cadence — these docs replace standups/retros.

## How to use these docs

Each sprint plan has the same shape:

- **Goal** — one sentence. If a task doesn't serve the goal, defer it.
- **Why now** — what blocks if this slips, what unblocks if it ships.
- **In scope / Out of scope** — written *before* the sprint starts, to resist drift.
- **Deliverables** — concrete artifacts that must exist by sprint end.
- **Exit criteria** — observable checks; "done" is not subjective.
- **Risks & mitigations** — top 2-3 things that could break the sprint.
- **Dependencies** — what must be true at sprint start (usually = prior sprint's exit criteria).
- **Day-by-day skeleton** — rough 10-working-day breakdown. Treat as a hypothesis, not a contract.
- **Notes & decisions** — append-only log during the sprint. Becomes the retro.

## Cadence (solo)

| Day | Ritual | Output |
|---|---|---|
| Sprint kick-off (Mon W1) | Re-read sprint plan; commit to scope | Filled "Day-by-day skeleton" |
| Mid-sprint check (Fri W1) | Honest status: green / yellow / red | Note in plan; trim scope if yellow |
| Sprint end (Fri W2) | Tick exit criteria; capture learnings | "Notes & decisions" appended; next sprint adjusted |

## Scope discipline

When a "nice idea" appears mid-sprint:

1. Does it serve **this sprint's goal**? If no → log in the next-applicable sprint's plan and forget it.
2. If yes → does it fit without bumping anything? If no → swap it for something explicit; don't silently add.

Scope creep is the #1 solo-dev failure mode. The whole point of these plans is to make trade-offs visible to your future self.

## Status legend

Used in each sprint's `Notes & decisions` log:

- 🟢 on track
- 🟡 trimming scope to stay on track
- 🔴 sprint goal at risk — escalate to self, decide what to cut
- ✅ shipped
- ⏭ deferred (with link to where it lives now)

## Index

| # | Title | File |
|---|---|---|
| 0 | Scaffolding & infra | [sprint-00-scaffolding.md](sprint-00-scaffolding.md) |
| 1 | Submission form & taxonomy | [sprint-01-submission-form.md](sprint-01-submission-form.md) |
| 2 | Rounds, questions, validation, soft delete | [sprint-02-submission-deep.md](sprint-02-submission-deep.md) |
| 3 | Aggregation & search indexing | [sprint-03-aggregation.md](sprint-03-aggregation.md) |
| 4 | Canonical wedge page + search UI | [sprint-04-wedge-page.md](sprint-04-wedge-page.md) |
| 5 | Topic browse, profiles, karma | [sprint-05-topics-profiles-karma.md](sprint-05-topics-profiles-karma.md) |
| 6 | Admin panel & moderation | [sprint-06-admin-moderation.md](sprint-06-admin-moderation.md) |
| 7 | Legal, SEO, polish, alpha launch | [sprint-07-launch-polish.md](sprint-07-launch-polish.md) |
