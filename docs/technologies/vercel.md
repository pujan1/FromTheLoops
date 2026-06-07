# Vercel

## Role In FromTheLoop

Vercel hosts the Next.js app, including server-rendered pages, route handlers, and middleware. It handles GitHub-connected deploys while Hetzner handles the long-running worker/search/Redis stack.

## Where It Lives

- Web app: `apps/web`
- Next config: `apps/web/next.config.ts`
- Env vars: Vercel dashboard and `.env.example`
- Architecture notes: `docs/architecture.md`

## Workflow Integration

Vercel runs the web app. Runtime integrations reach out to:

- Clerk for auth.
- Neon Postgres through `DATABASE_URL`.
- Redis over `rediss://` for BullMQ producer routes.
- Sentry during runtime and source-map upload during builds.

Node-only route handlers must declare:

```ts
export const runtime = "nodejs";
```

## Tradeoffs And Gotchas

- Vercel is a strong fit for Next.js SSR, RSC, and route handlers.
- Hobby function duration is finite; Redis retry storms can burn the whole limit.
- `.env.local` never reaches Vercel. Set env vars in the dashboard.
- `apps/web` runs `pnpm --filter @fromtheloop/db migrate` in `prebuild` before
  `next build`, because DB-backed Server Components may be prerendered during
  deploy. Keep preview deployments pointed at an isolated Neon branch if preview
  builds should be allowed to run migrations.
- Clerk middleware failures usually mean missing or incorrect Clerk env vars.
- Long-running jobs do not belong in Vercel functions; enqueue them into BullMQ.

## Common Workflow

1. Develop locally with `pnpm dev`.
2. Push to GitHub and let Vercel deploy `apps/web`.
3. Keep Vercel env vars aligned with `.env.example`, especially `DATABASE_URL`.
4. Verify Vercel preview/prod DB URLs target the intended Neon branch.
5. If a route starts long work, enqueue a BullMQ job instead of doing it inline.
