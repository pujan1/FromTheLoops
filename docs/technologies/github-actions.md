# GitHub Actions

## Role In FromTheLoop

GitHub Actions runs CI for pull requests and pushes to `main`. The current workflow installs dependencies, typechecks, lints, and runs tests.

## Where It Lives

- Workflow: `.github/workflows/ci.yml`
- Root scripts: `package.json`

## Workflow Integration

CI uses pnpm and the Node version from `.nvmrc`:

```yaml
jobs:
  verify:
    name: typecheck + lint + test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

## Tradeoffs And Gotchas

- CI protects the monorepo from type, lint, and test regressions.
- Testcontainers-based db tests need Docker availability on the runner.
- Placeholder package scripts can make CI look greener than it really is for packages without real tests or linting yet.
- Concurrency cancels stale runs on the same ref.

## Common Workflow

1. Keep root scripts representative of the checks that matter.
2. Add real package scripts as packages mature.
3. Avoid adding CI-only behavior that cannot be reproduced locally.
4. Inspect failing package output before changing the root workflow.
