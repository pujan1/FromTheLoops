# TypeScript

## Role In FromTheLoop

TypeScript is the static type system across the web app, worker, database package, shared validators, and search/core placeholders.

## Where It Lives

- Base config: `tsconfig.base.json`
- Package configs: `apps/*/tsconfig.json`, `packages/*/tsconfig.json`
- Root script: `pnpm typecheck`

## Workflow Integration

The base config is strict:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Workspace packages use ESM-style imports with `.js` extensions in TypeScript source, for example:

```ts
import * as schema from "./schema/index.js";
```

Next.js remaps those during bundling through `extensionAlias`.

## Tradeoffs And Gotchas

- Strict typing catches schema and form-shape drift early.
- `.js` import specifiers in TypeScript can feel odd, but they match NodeNext ESM output.
- TypeScript does not validate runtime request bodies. Use Zod at trust boundaries.
- Some package scripts are placeholders; check the package's `typecheck` command before relying on root output.

## Common Workflow

1. Keep exported types close to schemas and validators.
2. Prefer inferred types from Drizzle and Zod over hand-written duplicates.
3. Run `pnpm typecheck` before pushing cross-package changes.
4. When adding workspace imports to Next.js, make sure the package is listed in `transpilePackages`.
