# tsx

## Role In FromTheLoop

tsx runs TypeScript files directly in development and scripts. It is used for the worker dev loop, database migrations, seeding, and small operational scripts.

## Where It Lives

- Worker scripts: `apps/worker/package.json`
- DB scripts: `packages/db/package.json`
- Script files: `packages/db/src/migrate.ts`, `packages/db/src/seed/index.ts`, `apps/worker/src/scripts/**`

## Workflow Integration

Examples:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "migrate": "tsx src/migrate.ts",
    "seed": "tsx src/seed/index.ts",
    "enqueue:hello": "tsx src/scripts/enqueue-hello.ts"
  }
}
```

Production worker runtime does not use tsx. The worker is compiled with `tsc` and runs `node dist/index.js`.

## Tradeoffs And Gotchas

- tsx keeps dev and one-off scripts simple without a manual build step.
- It is a dev/runtime helper, not the production execution model.
- Script env vars still need to be present, usually through local env files or shell exports.
- Watch mode is useful for the worker, but long-running process behavior should still be tested in compiled production form when changing startup/shutdown logic.

## Common Workflow

1. Use tsx for local TypeScript scripts.
2. Keep production entrypoints compiled.
3. Run migrations and seeds through package scripts instead of invoking files ad hoc.
