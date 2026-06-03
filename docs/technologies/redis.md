# Redis

## Role In FromTheLoop

Redis is the BullMQ queue broker and future cache for hot reads. It runs locally in Docker and in production on the Hetzner box.

## Where It Lives

- Local compose: `docker-compose.yml`
- Production compose: `infra/hetzner/docker-compose.prod.yml`
- Web queue connection: `apps/web/lib/queue.ts`
- Worker connection: `apps/worker/src/redis.ts`

## Workflow Integration

Local Redis runs on `redis://localhost:6379`. Production exposes TLS Redis on `box.pujan.tech:6380` for external clients and plain Redis on the compose network for the worker.

```ts
// apps/worker/src/redis.ts
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const parsed = new URL(REDIS_URL);

export const redisConnection = {
  host: parsed.hostname,
  port: Number(parsed.port) || 6379,
  password: parsed.password || undefined,
  username: parsed.username || undefined,
  tls: parsed.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};
```

## Tradeoffs And Gotchas

- Self-hosting Redis keeps cost low but makes patching and uptime an ops concern.
- Production Redis uses AOF persistence.
- For external Vercel clients, use `rediss://` with TLS.
- Use URL-safe passwords. Hex output from `openssl rand -hex 32` avoids `/`, `+`, and `=` issues in URLs.
- BullMQ workers require `maxRetriesPerRequest: null`.

## Common Workflow

1. Start Redis locally with `pnpm docker:up`.
2. Put `REDIS_URL=redis://localhost:6379` in local env when needed.
3. Use `rediss://default:<password>@box.pujan.tech:6380` for Vercel.
4. Restart Redis after cert renewal through the certbot deploy hook.
