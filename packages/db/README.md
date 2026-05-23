# @fromtheloop/db

The only package that talks to Postgres. Everything else imports query helpers from here.

## Stack

- **Drizzle ORM** — TypeScript-first, SQL-shaped. See [ADR-0002](../../docs/adr/0002-orm-drizzle.md).
- **Neon Postgres** — branchable per environment (dev / staging / prod).
- **drizzle-kit** for migration generation.

## Layout (target)

```
src/
├── index.ts            # db client export
├── schema/             # one file per entity (reports, rounds, questions, ...)
│   └── index.ts        # barrel
├── queries/            # typed query helpers used by web + worker
├── migrations/         # generated SQL — committed
└── seed/               # seed_dummy + seed_curated fixtures
```

## Sprint 0 deliverable

- `pnpm db:migrate` runs against local Postgres
- `pnpm db:seed` inserts at least one trivial row
- Schema for the five top-level entities lives here by end of Sprint 2
