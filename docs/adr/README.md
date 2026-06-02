# Architecture Decision Records

Short, dated, append-only records of technical decisions. Format: [Michael Nygard's](https://github.com/joelparkerhenderson/architecture-decision-record/blob/main/locales/en/templates/decision-record-template-by-michael-nygard/index.md).

## Rules

1. **Immutable once accepted.** If a decision changes, write a new ADR that supersedes it and mark the old one. Never edit history.
2. **Date them.** Status + date in frontmatter. ADR-0007 written in 2027 should be obvious without `git log`.
3. **Keep them short.** 1–2 pages. If it's longer, it's probably an RFC.
4. **Explain alternatives.** "We picked X" without "we considered Y and Z because…" is a worse ADR.

## Index

| # | Title | Status | Date | Sprint |
|---|---|---|---|---|
| [0001](0001-stack-choice.md) | Stack choice — Next.js, Neon, Typesense, Hetzner | accepted | 2026-05-23 | 0 |
| [0002](0002-orm-drizzle.md) | ORM — Drizzle | accepted | 2026-05-23 | 0 |
| [0003](0003-i18n-url-contract.md) | i18n URL contract — single locale, no prefix | accepted | 2026-06-01 | 1 |
| 0004 | Validation rules and soft-delete semantics | _planned_ | — | 2 |
| 0005 | Aggregation strategy — Postgres matviews + Typesense facets | _planned_ | — | 3 |
| 0006 | URL contract and per-company level slugs | _planned_ | — | 4 |
| 0007 | Karma design — earn rules, non-goals | _planned_ | — | 5 |
| 0008 | RBAC, evidence storage, audit log | _planned_ | — | 6 |

Add new ADRs as `NNNN-kebab-case-title.md` and link them above.

## Template

See [template.md](template.md).
