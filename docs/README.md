# docs/

Long-form documentation that lives with the code. Four folders, four purposes:

| Folder | What goes here | Lifecycle |
|---|---|---|
| [adr/](adr/) | **Architecture Decision Records.** Short, dated. Captures *why* a choice was made and what the alternatives were. Immutable once accepted — supersede with a new ADR rather than editing. | Forever |
| [rfc/](rfc/) | **Request For Comments.** Longer proposals for non-trivial changes that need to be thought through before coding. RFCs become ADRs when accepted, or get archived if rejected. | Until accepted/rejected |
| [runbooks/](runbooks/) | **Operational guides.** "What to do when X happens" — incident response, daily mod cycle, backup restore, deploys. Living docs; edit freely. | Living |
| [technologies/](technologies/) | **Stack references.** One page per technology: role, integration points, workflow, tradeoffs, and code snippets. Living docs; edit when implementation details change. | Living |

## When to write what

- **ADR** when you make a decision that's *hard to reverse* and you want future-you (or a future collaborator) to understand the reasoning. Examples: which DB, which auth provider, monolith vs services, content moderation policy.
- **RFC** when you're about to make a decision but want to lay out the options on paper first. Most ADRs in this repo will skip the RFC stage because the answer is obvious; reach for RFC only when it isn't.
- **Runbook** when an operational procedure has more than ~3 steps or needs to be done under stress. If you'd Google it at 2am during an outage, write the runbook instead.
- **Technology reference** when the question is "how are we using this tool?" rather than "why did we choose it?" or "what exact steps do I run?"

## When NOT to write any of these

- A code comment, README section, or PR description is enough → use those.
- It's truly ephemeral (this sprint only) → use a sprint plan's "Notes & decisions" section.
- It's about *you* (preferences, role, working style) → use auto-memory, not docs.

## Conventions

- Filenames: `NNNN-kebab-case-title.md` for ADRs/RFCs (zero-padded 4 digits). Runbooks: `kebab-case-title.md`.
- ADR statuses: `proposed`, `accepted`, `superseded by ADR-NNNN`, `rejected`.
- Every ADR/RFC has a date in frontmatter. Don't rely on git history alone — the doc should be readable in isolation.
- Cross-link by relative path: `[ADR-0001](../adr/0001-stack-choice.md)`.
- PLAN.md remains the single source of truth for **product/scope** decisions. ADRs cover **technical** decisions. When they overlap, ADR links back to PLAN.md.
