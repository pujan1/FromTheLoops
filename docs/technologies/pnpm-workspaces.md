# pnpm Workspaces

## Role In FromTheLoop

pnpm manages the monorepo package graph and root scripts. The repo contains app packages under `apps/*` and shared packages under `packages/*`.

## Where It Lives

- Workspace config: `pnpm-workspace.yaml`
- Root scripts: `package.json`
- Package manifests: `apps/*/package.json`, `packages/*/package.json`

## Workflow Integration

Root scripts delegate to packages:

```json
{
  "scripts": {
    "dev": "pnpm --filter @fromtheloop/web dev",
    "worker:dev": "pnpm --filter @fromtheloop/worker dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "db:migrate": "pnpm --filter @fromtheloop/db migrate"
  }
}
```

Workspace packages depend on each other with `workspace:*`:

```json
{
  "dependencies": {
    "@fromtheloop/db": "workspace:*",
    "@fromtheloop/shared": "workspace:*"
  }
}
```

## Tradeoffs And Gotchas

- pnpm's strict dependency graph catches undeclared dependencies earlier than npm-style hoisting.
- Version skew between direct and transitive dependencies can create duplicate TypeScript types. The known case is `ioredis`; avoid direct imports and let BullMQ own it.
- `corepack` resolves the pinned pnpm version in CI and Docker.
- Recursive scripts only work as well as each package script. Some package test/lint scripts are placeholders today.

## Common Workflow

1. Add shared code to `packages/*`.
2. Export it from that package's entrypoint.
3. Add `workspace:*` dependency to consumers.
4. Use root recursive scripts for broad checks.
