# Drizzle ORM

## Role In FromTheLoop

Drizzle defines typed database schema, generates SQL migrations, and provides query helpers for app and worker code. It is the boundary between TypeScript and PostgreSQL.

## Where It Lives

- Config: `packages/db/drizzle.config.ts`
- Schema barrel: `packages/db/src/schema/index.ts`
- Migrations: `packages/db/src/migrations/**`
- DB client: `packages/db/src/index.ts`
- ADR: `docs/adr/0002-orm-drizzle.md`

## Workflow Integration

Every schema module must be re-exported from the schema barrel because drizzle-kit reads that file:

```ts
// packages/db/src/schema/index.ts
export * from "./enums.js";
export * from "./users.js";
export * from "./taxonomy.js";
export * from "./drafts.js";
export * from "./reports.js";
export * from "./rounds.js";
export * from "./questions.js";
export * from "./verifications.js";
export * from "./moderation.js";
```

Example table definition:

```ts
export const interviewReports = pgTable(
  "interview_reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    level: text("level").notNull(),
    status: reportStatus("status").notNull().default("pending_moderation"),
  },
  (t) => [
    index("reports_company_role_level_idx").on(
      t.companyId,
      t.canonicalRoleId,
      t.level,
    ),
  ],
);
```

## Tradeoffs And Gotchas

- Drizzle is light and type-friendly, with no Prisma-style generated client step.
- SQL migrations are committed and should be reviewed like code.
- Raw SQL is still used for advanced Postgres features such as trigram similarity.
- NodeNext package imports require `.js` extensions in source files.

## Common Workflow

1. Edit schema in `packages/db/src/schema`.
2. Export new schema modules from `schema/index.ts`.
3. Run `pnpm --filter @fromtheloop/db generate`.
4. Run `pnpm db:migrate`.
5. Add migration and constraint tests.
