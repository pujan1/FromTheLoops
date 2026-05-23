---
status: accepted
date: 2026-05-23
deciders: [pujan]
---

# ADR-0002 — ORM: Drizzle

## Context

[ADR-0001](0001-stack-choice.md) locked Neon Postgres but explicitly deferred the ORM choice to Sprint 0:

> **Drizzle vs Prisma**: not decided in this ADR. Sprint 0 picks; defaulting toward Drizzle for lighter weight and better edge support, but Prisma's tooling is mature. Whichever wins gets its own short ADR.

This is that ADR. Picking now (Sprint 0, Day 1) so `packages/db/` can be wired without a second pass.

## Decision

Use **Drizzle ORM** with **drizzle-kit** for migrations.

## Why

- **Edge/serverless friendly.** Drizzle's runtime is small and works under Vercel Edge + Neon's serverless driver without ceremony. Prisma's edge story has improved but historically required `@prisma/adapter-neon` plus driver-specific quirks.
- **SQL-shaped, TypeScript-first.** The query builder reads like SQL; types come from the schema definition rather than a generated client. This matters because the wedge has hand-tuned queries (materialized views, faceted aggregation) where opaque ORM abstractions become liabilities at 2am.
- **Migrations are real SQL.** `drizzle-kit generate` emits SQL files that get committed. No "shadow database" magic. Reviewable in diff, replayable manually.
- **Lighter dependency footprint.** Smaller install, faster cold starts on the worker box.
- **First-class Neon integration.** `drizzle-orm/neon-serverless` is the canonical pairing.

## Alternatives considered

| Option | Why not |
|---|---|
| **Prisma** | Mature tooling, great DX for autocomplete, but the generated client is heavy, edge support is bolted on, and the schema DSL hides SQL we'll need to read. Better fit for teams that want to avoid SQL; we don't. |
| **Kysely** | Also TS-first and SQL-shaped — strong contender. Loses on migrations: Kysely needs a separate tool (kysely-codegen / sst migrations / etc.), whereas drizzle-kit is bundled. Less ecosystem momentum. |
| **Raw `pg` + handwritten SQL** | Honest, but no migration story, no type-safety on results, and every file re-derives connection wiring. Too low-level for solo-dev velocity. |
| **TypeORM / Sequelize** | Legacy DX, decorator-heavy, weaker types. Not seriously considered. |

## Consequences

### Positive
- Schema definitions in `packages/db/src/schema/` are the source of truth — types flow outward automatically.
- Materialized-view definitions live as raw SQL in `packages/db/src/migrations/` next to generated migrations, kept honest by `drizzle-kit check`.
- Easy to swap the driver between `pg` (worker, long-lived) and `@neondatabase/serverless` (Vercel Edge) without changing query code.

### Negative
- Smaller ecosystem than Prisma — fewer Stack Overflow answers, fewer integrations. Mitigated by Drizzle docs being good and the SQL escape hatch always available.
- No equivalent of `prisma studio` is as polished; `drizzle-kit studio` works but is younger.
- Schema-first mental model means schema changes always start in TypeScript — no "introspect existing DB" shortcut. Fine for a greenfield repo; would matter if we ever inherit a DB.

### Neutral / open
- Whether to introduce **Drizzle relations** (the relational query API) vs sticking to query-builder joins. Defer until the first cross-table read in Sprint 3.

## References

- [ADR-0001 §Neutral/open](0001-stack-choice.md#neutral--open) — this ADR resolves that item
- [Sprint 0 plan](../../sprints/sprint-00-scaffolding.md) — Day 2 wires Drizzle
- Drizzle docs: <https://orm.drizzle.team/>
- Neon + Drizzle guide: <https://neon.tech/docs/guides/drizzle>
