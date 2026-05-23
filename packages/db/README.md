# @fromtheloop/db

The only package that talks to Postgres. Everything else imports query helpers from here.

## Stack

- **Drizzle ORM** — TypeScript-first, SQL-shaped. See [ADR-0002](../../docs/adr/0002-orm-drizzle.md).
- **Neon Postgres** — branchable per environment (dev / staging / prod).
- **drizzle-kit** for migration generation.

## Layout

```
src/
├── index.ts            # db client (getDb / closeDb) + schema re-export
├── migrate.ts          # `pnpm db:migrate` entrypoint
├── schema/             # one file per entity group
│   ├── enums.ts
│   ├── users.ts
│   ├── taxonomy.ts     # companies, roles, topics
│   ├── reports.ts      # interview_reports
│   ├── rounds.ts
│   ├── questions.ts    # questions + question_topics join
│   ├── verifications.ts
│   ├── moderation.ts
│   └── index.ts        # barrel — drizzle-kit reads this
├── migrations/         # generated SQL — committed
└── seed/               # seed_dummy + seed_curated fixtures
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm --filter @fromtheloop/db generate` | Diff schema → emit a new SQL migration |
| `pnpm db:migrate` | Apply pending migrations (idempotent) |
| `pnpm db:seed` | Insert sprint-0 placeholder rows |
| `pnpm --filter @fromtheloop/db studio` | Drizzle Studio (browser-based table viewer) |

All scripts read `DATABASE_URL` from `.env.local` at the repo root, then `.env`, then `packages/db/.env`.

## Sprint 0 deliverable status

- [x] Drizzle wired with `drizzle-kit`; first migration generated
- [x] Schema for the five top-level entities + supporting taxonomy committed (pulled forward from Sprint 2)
- [x] `pnpm db:migrate` runs against local docker-compose Postgres
- [x] `pnpm db:seed` inserts at least one trivial row
