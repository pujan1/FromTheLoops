# corepack

## Role In FromTheLoop

corepack makes the pinned pnpm version available without globally installing a mismatched package manager. The repo pins `pnpm@9.12.0` in the root `package.json`.

## Where It Lives

- Package manager pin: `package.json`
- CI setup: `.github/workflows/ci.yml`
- Worker Dockerfile: `apps/worker/Dockerfile`

## Workflow Integration

The root package declares:

```json
{
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

CI uses `pnpm/action-setup`; Docker builds enable/use pnpm through the Node toolchain.

## Tradeoffs And Gotchas

- Pinning pnpm reduces "works on my machine" package-manager drift.
- corepack behavior depends on the Node version being new enough.
- If the pinned pnpm version changes, update Docker/CI assumptions and regenerate lockfile with that version.

## Common Workflow

1. Let the pinned `packageManager` field choose pnpm.
2. Use `pnpm install --frozen-lockfile` in CI and production builds.
3. Keep Node version and pnpm version aligned across local, CI, and Docker.
