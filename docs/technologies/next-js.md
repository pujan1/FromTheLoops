# Next.js

## Role In FromTheLoop

Next.js 15 runs `apps/web`: public pages, protected dashboard/submission surfaces, server components, route handlers, and the App Router layout tree. It is the main application boundary between users, Clerk, Postgres, Redis, and the shared workspace packages.

## Where It Lives

- App source: `apps/web/app/`
- API route handlers: `apps/web/app/api/**/route.ts`
- Middleware: `apps/web/middleware.ts`
- Config: `apps/web/next.config.ts`
- Package scripts: `apps/web/package.json`

## Workflow Integration

Local development starts from the repo root:

```bash
pnpm docker:up
pnpm db:migrate
pnpm dev
```

The root `pnpm dev` script delegates to `@fromtheloop/web`. Vercel builds and hosts this app in production. Route handlers that touch Node-only packages, especially BullMQ, must opt into the Node runtime.

```ts
// apps/web/app/api/hello/enqueue/route.ts
import { auth } from "@clerk/nextjs/server";
import { getHelloQueue } from "@/lib/queue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const queue = getHelloQueue();
  const job = await queue.add("hello", { message: "hello" });
  return Response.json({ jobId: job.id });
}
```

## Tradeoffs And Gotchas

- App Router and React Server Components are a strong fit for SEO and server-side data access, but require clear separation between server-only code and client components.
- Edge runtime is not a default for this app. BullMQ, Redis parsing, and many worker-adjacent integrations require `runtime = "nodejs"`.
- Workspace packages use NodeNext-style `.js` imports that point to TypeScript source. `next.config.ts` remaps `.js` to `.ts/.tsx` during bundling.
- `@/*` is the local app alias; workspace packages should still be imported through `@fromtheloop/*`.

## Common Workflow

1. Add or change app code under `apps/web/app`.
2. If the route needs auth, use Clerk middleware or `auth()` inline.
3. If the route uses Redis/BullMQ, set `export const runtime = "nodejs"`.
4. Keep reusable domain/data logic in workspace packages, not inside route handlers.
5. Verify with `pnpm --filter @fromtheloop/web typecheck`.
