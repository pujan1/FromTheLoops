# ESLint

## Role In FromTheLoop

ESLint catches style and correctness issues that TypeScript does not cover. It is configured for the web app and worker, while several package lint scripts are placeholders.

## Where It Lives

- Web config: `apps/web/eslint.config.mjs`
- Worker config: `apps/worker/eslint.config.mjs`
- Package scripts: `apps/web/package.json`, `apps/worker/package.json`
- Root script: `pnpm lint`

## Workflow Integration

The root lint command runs package lint scripts recursively:

```bash
pnpm lint
```

The worker has a direct ESLint script:

```json
{
  "scripts": {
    "lint": "eslint ."
  }
}
```

## Tradeoffs And Gotchas

- ESLint complements TypeScript by catching import, framework, and code-quality issues.
- `apps/web` currently uses a `next lint` script, while newer Next.js versions have changed lint command behavior. Watch this if CI starts failing on tooling rather than code.
- Placeholder lint scripts in shared packages should be replaced when those packages gain meaningful implementation.

## Common Workflow

1. Run `pnpm lint` before pushing.
2. For package-specific issues, run `pnpm --filter <package> lint`.
3. Add package lint configs as shared packages move beyond placeholders.
