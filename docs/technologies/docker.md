# Docker

## Role In FromTheLoop

Docker runs local dependencies and the production worker stack. Local compose provides Postgres, Redis, and Typesense. Production compose runs Redis, Typesense, and the BullMQ worker on Hetzner.

## Where It Lives

- Local compose: `docker-compose.yml`
- Production compose: `infra/hetzner/docker-compose.prod.yml`
- Worker image: `apps/worker/Dockerfile`
- Bootstrap script: `infra/hetzner/bootstrap.sh`

## Workflow Integration

Local:

```bash
pnpm docker:up
pnpm docker:down
```

Production worker service:

```yaml
worker:
  image: fromtheloop-worker:latest
  pull_policy: never
  environment:
    - REDIS_URL=redis://default:${REDIS_PASSWORD}@redis:6379
    - WORKER_CONCURRENCY=${WORKER_CONCURRENCY:-4}
    - NODE_ENV=production
  depends_on:
    redis:
      condition: service_healthy
```

## Tradeoffs And Gotchas

- Compose keeps local and production dependency topology similar.
- The worker image is built directly on the Hetzner box, so no registry is required yet.
- `pull_policy: never` prevents Docker from trying to fetch a non-existent registry image.
- Local Postgres/Redis/Typesense volumes persist across restarts; use `docker compose down -v` only when you intentionally want a clean slate.

## Common Workflow

1. Run local dependencies with `pnpm docker:up`.
2. Build or test app code against local service ports.
3. For production, build the worker image on the box.
4. Use `bootstrap.sh` to refresh compose/systemd state.
