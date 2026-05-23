# Runbooks

Operational guides. "What to do when X happens" or "how to do Y reliably". Living docs — edit freely as procedures evolve.

## Rule of thumb

If you'd Google a procedure at 2am during an outage, write the runbook *now* instead. Sprint 7 explicitly carves time for the launch-critical ones.

## Planned runbooks

Created in the sprint that needs them:

| Runbook | Created in sprint | Status |
|---|---|---|
| `hetzner-bootstrap.md` — provision a fresh Hetzner CX22 from zero | 0 | _planned_ |
| `moderation.md` — daily 30-minute mod cycle | 6 | _planned_ |
| `alerts.md` — Sentry alert rules + what to do on each | 7 | _planned_ |
| `day-1.md` — first 24h after opening to real users | 7 | _planned_ |
| `backup-restore.md` — restore Neon from R2 nightly backup | 7 | _planned_ |

Add new runbooks as plain `kebab-case-title.md` (no numeric prefix — runbooks don't have a meaningful ordering).

## Style

- **Steps must be copy-pasteable.** A runbook full of "configure X appropriately" is not a runbook.
- **Front-load assumptions and prereqs.** "This assumes you have SSH access to the Hetzner box and `kubectl` configured" — name them up front so the reader doesn't get five steps in and bail.
- **Include rollback.** Every change-the-system runbook ends with "if this went wrong, here's how to undo it".
- **Date the last verification.** Stale runbooks are dangerous. Add `> Last verified: YYYY-MM-DD` at the top; refresh whenever you actually use it.
