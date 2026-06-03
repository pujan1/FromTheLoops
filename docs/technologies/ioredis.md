# ioredis

## Role In FromTheLoop

ioredis is the Redis client BullMQ uses internally. FromTheLoop intentionally does not depend on or import ioredis directly.

## Where It Lives

- Transitive dependency through BullMQ.
- Connection options are built in `apps/web/lib/queue.ts` and `apps/worker/src/redis.ts`.
- Architecture gotcha: `docs/architecture.md`

## Workflow Integration

Application code passes BullMQ a `ConnectionOptions`-shaped object instead of constructing an `IORedis` instance:

```ts
import { Queue, type ConnectionOptions } from "bullmq";

function buildConnection(): ConnectionOptions {
  const parsed = new URL(process.env.REDIS_URL ?? "");
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
```

## Tradeoffs And Gotchas

- Avoiding direct ioredis imports prevents duplicate type identity problems when pnpm resolves multiple versions.
- BullMQ still gets the Redis behavior it needs.
- If advanced Redis operations are needed later, prefer a small wrapper package and pin versions deliberately.
- Wrong Redis credentials can trigger long retry behavior; fail-fast behavior should be considered for user-facing routes.

## Common Workflow

1. Do not add `ioredis` as a direct dependency without a concrete need.
2. Build Redis connection options from `REDIS_URL`.
3. Let BullMQ own its client lifecycle.
4. Revisit this doc if a non-BullMQ Redis client becomes necessary.
