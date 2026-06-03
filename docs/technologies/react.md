# React

## Role In FromTheLoop

React 19 is the UI layer bundled through Next.js. Server components are the default for app routes, while client components are used for interactive surfaces like forms, comboboxes, theme controls, and browser-only state.

## Where It Lives

- Pages and layouts: `apps/web/app/**`
- Shared UI components: `apps/web/components/ui/**`
- Submission flow: `apps/web/app/submit/**`
- Root providers: `apps/web/app/layout.tsx`

## Workflow Integration

Server components can call server-side helpers directly. For example, the dashboard page reads Clerk user state and upserts a local `users` row:

```tsx
// apps/web/app/dashboard/page.tsx
import { currentUser } from "@clerk/nextjs/server";
import { getDb, getOrCreateUserByClerkId } from "@fromtheloop/db";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) throw new Error("dashboard: missing user");

  await getOrCreateUserByClerkId(getDb(), {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  return <main>Signed in as {user.id}</main>;
}
```

Client components should stay focused on browser interaction and use server actions or route handlers for durable writes.

## Tradeoffs And Gotchas

- Server components reduce client JavaScript and keep data fetching close to rendering, but they cannot use browser hooks.
- Client components are useful for input-heavy flows, but every `use client` boundary increases shipped JS.
- Providers belong high in `app/layout.tsx`. FromTheLoop currently wraps the app with `ClerkProvider` and `NextIntlClientProvider`.
- Avoid duplicating domain validation in React components. Use shared Zod schemas where possible.

## Common Workflow

1. Start with a server component for routes and read-heavy UI.
2. Move only the interactive part into a client component.
3. Keep design-system primitives in `apps/web/components/ui`.
4. Keep durable data writes behind server actions or route handlers.
5. Run the web typecheck after changing component props.
