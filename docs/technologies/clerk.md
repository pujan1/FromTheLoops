# Clerk

## Role In FromTheLoop

Clerk handles authentication, sessions, protected routes, and the prebuilt sign-in/sign-up UI. The application maps Clerk principals into the local `users` table so reports, drafts, and moderation records can use internal foreign keys.

## Where It Lives

- Middleware: `apps/web/middleware.ts`
- Auth pages: `apps/web/app/sign-in/[[...sign-in]]/page.tsx`, `apps/web/app/sign-up/[[...sign-up]]/page.tsx`
- Root provider: `apps/web/app/layout.tsx`
- User upsert: `apps/web/app/dashboard/page.tsx`, `packages/db/src/users.ts`
- Env examples: `.env.example`

## Workflow Integration

Middleware protects app surfaces that require a signed-in user:

```ts
// apps/web/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/submit(.*)",
  "/drafts(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});
```

Route handlers can also enforce auth inline:

```ts
const { userId } = await auth();
if (!userId) return new Response("Unauthorized", { status: 401 });
```

## Tradeoffs And Gotchas

- Clerk avoids rolling auth, password storage, session management, and sign-in UI from scratch.
- Clerk user ids are external ids. Local business data should reference internal `users.id` rows.
- Missing or wrong Clerk env vars can cause Vercel middleware failures.
- Webhook sync is planned, but the current dashboard path uses upsert-on-visit as a pragmatic bridge.

## Common Workflow

1. Add a route to `createRouteMatcher` if the whole surface requires auth.
2. Use `auth()` inside API handlers when only that handler requires auth.
3. Map Clerk users into local users before creating rows with user FKs.
4. Keep `NEXT_PUBLIC_CLERK_*` and `CLERK_SECRET_KEY` synced in local and Vercel envs.
