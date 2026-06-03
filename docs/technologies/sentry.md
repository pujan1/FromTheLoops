# Sentry

## Role In FromTheLoop

Sentry tracks runtime errors in the Next.js app and the worker. Web instrumentation captures request errors; worker instrumentation captures process and job failures.

## Where It Lives

- Web config: `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`
- Web instrumentation: `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`
- Worker init: `apps/worker/src/sentry.ts`
- Worker usage: `apps/worker/src/index.ts`
- Next config wrapper: `apps/web/next.config.ts`

## Workflow Integration

Next.js registers the runtime-appropriate config:

```ts
// apps/web/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

The worker imports Sentry before anything else:

```ts
// apps/worker/src/index.ts
import { Sentry } from "./sentry.js";
```

## Tradeoffs And Gotchas

- Sentry gives visibility into Vercel and worker failures without building internal observability first.
- Worker Sentry must initialize before other imports so global handlers are registered.
- Source-map upload needs Sentry build env vars; local builds still succeed without them.
- `sendDefaultPii` is false in the worker config.

## Common Workflow

1. Add contextual tags and extras around job failures.
2. Keep DSNs optional in local and CI.
3. Use `apps/web/app/api/debug-sentry/route.ts` or worker `sentry:test` script when validating setup.
4. Avoid logging sensitive payloads in captured error context.
