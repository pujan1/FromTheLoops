# Zod

## Role In FromTheLoop

Zod provides runtime validation for shared request and form data. The main current use is the interview-report submission flow, where draft data and ready-to-submit data have different validity rules.

## Where It Lives

- Shared validation: `packages/shared/src/submission.ts`
- Shared package exports: `packages/shared/src/index.ts`
- Consumers: submission pages, server actions, and future API handlers

## Workflow Integration

Submission data has two schemas:

- `submissionDraftSchema`: tolerant of partial data for autosave.
- `submissionReadySchema`: strict enough to continue to rounds.

```ts
// packages/shared/src/submission.ts
export const companySelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("suggested"),
    name: z.string().trim().min(1).max(120),
  }),
]);

export const submissionReadySchema = z.object({
  company: companySelectionSchema,
  role: roleSelectionSchema,
  level: levelSelectionSchema,
  outcome: outcomeSchema.nullable(),
  month: monthSchema,
  attribution: attributionSchema,
});
```

## Tradeoffs And Gotchas

- Zod catches malformed runtime data that TypeScript cannot see.
- Shared schemas keep client, server action, and route-handler validation aligned.
- Enum values mirror database enums manually today. When DB enums change, update the shared tuples too.
- Draft schemas should be intentionally permissive; ready schemas should guard workflow transitions.

## Common Workflow

1. Add or update a schema in `packages/shared`.
2. Export inferred types from the schema file.
3. Use `.parse` or `.safeParse` at trust boundaries.
4. Add shared package tests when validation behavior changes.
