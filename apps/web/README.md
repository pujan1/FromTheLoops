# @fromtheloop/web

Next.js 15 App Router. Hosts every user-facing page and the route handlers / server actions that back them.

## Responsibilities

- All SSR/SSG pages (every SEO surface — see [PLAN.md §URL structure](../../PLAN.md#url-structure))
- Clerk auth UI + middleware
- Route handlers under `app/api/*` for write endpoints
- Enqueues background work via BullMQ → consumed by `@fromtheloop/worker`

## Not responsible for

- Background processing (aggregation refresh, search indexing, email dispatch) — that lives in [@fromtheloop/worker](../worker/)
- Schema or query definitions — those live in [@fromtheloop/db](../../packages/db/)

## Sprint 0 — Day 1 setup (TODO)

```bash
pnpm dlx create-next-app@latest apps/web --ts --app --tailwind --eslint --src-dir --import-alias '@/*'
```

Then wire Clerk, Sentry, and the workspace package deps already declared in `package.json`.
