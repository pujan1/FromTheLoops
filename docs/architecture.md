# Architecture & stack reference

> Single canonical reference of every tool in the stack: what it does for us, where it runs, and which gotchas we've already hit. Living doc — edit when something changes.
>
> *For the **why** behind each choice see [ADR-0001](adr/0001-stack-choice.md). For the **how-to** of re-provisioning see [runbooks/hetzner-bootstrap.md](runbooks/hetzner-bootstrap.md). For **how this scales as traffic grows** see [scaling.md](scaling.md).*

## At a glance

```
                  ┌──────────────┐
                  │  Cloudflare  │  DNS zone for pujan.tech
                  │     DNS      │  • arvind.ns + carol.ns nameservers
                  └──────┬───────┘  • Email Routing (Day 7)
                         │
                         │ resolves
                         ▼
  user ──HTTPS──▶  Vercel Edge ─────postgres://──────▶  Neon Postgres
                  Next.js 15           │                (dev/staging/prod
                  + Clerk middleware   │                 branches)
                                       │
                                       ├────rediss://(TLS)────▶ Hetzner cax11 (Falkenstein)
                                       │                       ┌──────────────────────────┐
                                       │                       │  Docker compose stack    │
                                       └────HTTPS auth──────▶  │  ├─ Redis 7  (6380 TLS,  │
                                            Clerk              │  │             6379 LAN) │
                                                               │  ├─ Typesense 27          │
                                                               │  └─ Worker (BullMQ)       │
                                                               └──────────────────────────┘
                                                                   │
                                                                   ├─ certbot ▶ Cloudflare DNS-01
                                                                   └─ ufw, fail2ban, systemd
```

## Hosting & infrastructure

### Vercel (free tier)
- **Runs:** `apps/web` (Next.js App Router) including SSR pages, API route handlers, middleware
- **Region:** US-east default (sfo1 deploys observed)
- **Why:** zero-config SSR-for-SEO, RSC support, GitHub auto-deploy, free for solo project
- **Notes:**
  - Env vars set in dashboard; **`.env.local` is laptop-only, never reaches Vercel**
  - Hobby plan has 300s max function duration; we hit it once during a retry storm to a misconfigured Redis password
  - Setting `runtime = "nodejs"` in route handlers is required for BullMQ — Edge runtime can't use ioredis

### Hetzner Cloud — `cax11` (~€4.30/mo)
- **Specs:** ARM (Ampere), 2 vCPU, 4 GB RAM, 40 GB SSD, Falkenstein (`fsn1`)
- **Runs:** Redis, Typesense, BullMQ worker (via Docker compose)
- **Why ARM/EU instead of cx22/Ashburn:** cx22 SKU is EU-only; Ashburn equivalents are either under-RAM'd (cpx11 = 2GB) or 3× the budget (cpx21 ~$15/mo). cax11 + Falkenstein matches the original 4GB / $5 spec.
- **Trade-off accepted:** US users incur ~100 ms search latency when Typesense ships in Sprint 3. Mitigation path: switch to cpx21 in Ashburn, or front search with Typesense Cloud (already noted as Sprint 0 risk).
- **Notes:**
  - Provisioned via `hcloud` CLI + `infra/hetzner/cloud-init.yaml`
  - Re-provisioning target: <1 hour from a fresh project, per the runbook

### Cloudflare (free tier)
- **DNS:** authoritative for `pujan.tech`. Nameservers `arvind.ns.cloudflare.com` / `carol.ns.cloudflare.com`. All records currently DNS-only (gray cloud) — no proxying.
- **API token:** scoped to `Zone.DNS:Edit + Zone.Zone:Read` on `pujan.tech` only. Lives on the Hetzner box at `/etc/letsencrypt/secrets/cloudflare.ini` (0600). Used by certbot for DNS-01 ACME challenges.
- **Planned:** Email Routing (`legal@pujan.tech` → personal inbox, Day 7), R2 (object storage, Day 7+)
- **Notes:**
  - Moved from Squarespace nameservers; hit a transient DNSSEC-bogus window because the .tech registry kept an old DS record briefly. Diagnosed via `dig +cd` (validation off → NOERROR while validating resolvers returned SERVFAIL). Self-healed in ~30 min.
  - Cloudflare nameserver names are random pairs from a pool of human first names — no security significance to `arvind` / `carol`.

### Neon Postgres (free tier)
- **Runs:** primary database. Branches per environment (dev/staging/prod) once wired up.
- **Status:** schema + migrations ready (`packages/db`), full integration pending — local docker-compose Postgres covers Sprint 0 needs.
- **Notes:**
  - Connection from Vercel functions uses serverless driver pattern; pgBouncer / pooled endpoint becomes important when traffic arrives

### Squarespace (registrar only)
- **Purpose:** holds the `pujan.tech` registration. We *only* use them for renewal; DNS lives in Cloudflare.
- **Notes:** DNSSEC settings here are easy to overlook — toggle off **before** flipping nameservers or the domain blackholes.

### GitHub Actions
- **Runs:** CI on PRs (typecheck + lint + test). Vercel handles deploys.
- **Status:** wired in `.github/workflows/` from Day 1; CI on real test suite since Day 2 (vitest + testcontainers)

## Domain & TLS

### `pujan.tech` zone layout
| Subdomain | Type | Target | Purpose |
|---|---|---|---|
| `pujan.tech` (apex) | A × 4 | `185.199.108-111.153` | Existing portfolio on GitHub Pages |
| `www` | CNAME | `pujan1.github.io` | Portfolio www |
| `box` | A | `178.105.212.199` | Hetzner box (SSH + rediss) |
| `loops` *(planned)* | CNAME | Vercel target | Production hostname for the app |

### Let's Encrypt (via certbot)
- **Cert:** `box.pujan.tech`, expires every 90 days, auto-renewed by `certbot.timer`
- **Challenge:** DNS-01 via `python3-certbot-dns-cloudflare` (no port 80 hole, no HTTP origin needed)
- **Renewal hook:** `/etc/letsencrypt/renewal-hooks/deploy/fromtheloop-redis.sh` copies certs into `/opt/fromtheloop/certs` (uid 999 = redis user inside container) and `docker restart fromtheloop-redis`

## Application framework

### Next.js 15 (App Router) — `apps/web`
- **React Server Components** by default; route handlers for APIs; middleware for auth gating
- **Route handlers** at `app/**/route.ts` — explicitly set `export const runtime = "nodejs"` when using Node-only libs (e.g. BullMQ)
- **Path alias:** `@/*` → `apps/web/*`
- **Workspace package transpilation:** `next.config.ts` lists `@fromtheloop/{core,db,search,shared}` and remaps `.js` → `.ts/.tsx` extensions (needed because the workspace uses NodeNext resolution)

### React 19
- Bundled with Next.js 15

### TypeScript 5.5
- Strict mode + `noUncheckedIndexedAccess` + `noImplicitOverride` (`tsconfig.base.json`)
- `module: NodeNext` in workspace packages → imports must include `.js` extensions (resolved to `.ts` at build time)

### pnpm 9 (workspaces)
- Monorepo root has `packageManager: "pnpm@9.12.0"` and `pnpm-workspace.yaml` listing `apps/*` and `packages/*`
- **Gotcha:** if two workspace packages depend on slightly different versions of the same lib (e.g. `ioredis`), pnpm may not dedupe and TypeScript will complain about duplicate type identities. Fix: don't depend on the lib directly — let one upstream (e.g. BullMQ) provide it.

### Monorepo layout
```
apps/
  web/      Next.js — public site + APIs
  worker/   BullMQ consumer, runs on Hetzner inside Docker
packages/
  db/       Drizzle schema, migrations, query helpers, test setup
  core/     domain logic (placeholder)
  search/   Typesense client + index shape (placeholder)
  shared/   cross-package types/zod validators (placeholder)
infra/
  hetzner/  cloud-init, prod docker-compose, bootstrap.sh, systemd unit
docs/       ADRs, RFCs, runbooks, this file
sprints/    per-sprint plans + day-by-day notes
```

## Auth

### Clerk (free tier)
- **Package:** `@clerk/nextjs` 7.4.1
- **Wiring:** `apps/web/middleware.ts` calls `clerkMiddleware()` and protects `/dashboard*` via `createRouteMatcher`. Other routes use `auth.protect()` inline (e.g. `/api/hello/enqueue`)
- **UI routes:** catch-all `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]` pages use Clerk's prebuilt components
- **Env vars (Vercel):** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, plus the `*_URL` ones from `.env.example`
- **Notes:**
  - If middleware crashes at runtime with 500/`MIDDLEWARE_INVOCATION_FAILED`, the Clerk env vars are missing/wrong
  - Vercel "Sensitive" toggle on `CLERK_SECRET_KEY` is optional — env vars are encrypted at rest regardless; Sensitive just hides them in the dashboard

## Data layer

### PostgreSQL 16
- **Source of truth** for all entities (reports, rounds, questions, users, taxonomy)
- **Local dev:** Docker container (`fromtheloop-postgres`, port 5432) via root `docker-compose.yml`
- **Prod:** Neon, branches per env (once wired Day 7+)
- **Schema:** 10 tables, declared in `packages/db/src/schema/`

### Drizzle ORM 0.45
- **Why:** lighter than Prisma, no codegen step, runtime-safe types, plays well with edge runtimes (future-proofing)
- **Migrations:** Drizzle Kit generates SQL from schema diff; committed under `packages/db/src/migrations/`
- **Scripts:** `pnpm db:migrate`, `pnpm db:seed`, both via `tsx`

### Redis 7 — alpine
- **Roles:** BullMQ queue broker (primary), eventual cache for hot reads
- **Local dev:** Docker (`fromtheloop-redis`, port 6379)
- **Prod:**
  - Plain `redis://redis:6379` on the docker compose network for the in-box worker
  - TLS `rediss://default:<pw>@box.pujan.tech:6380` for external clients (Vercel)
  - AOF persistence on (`--appendonly yes`)
- **Notes:**
  - `--tls-auth-clients no` — TLS terminates at Redis, no mutual TLS; password is the auth
  - Cert mounted at `/tls/{fullchain,privkey}.pem` from `/opt/fromtheloop/certs` (owned uid 999)
  - **URL-safe password matters**: `openssl rand -base64 32` yields `/`, `+`, `=` which break URL parsing in `new URL()`. Use `openssl rand -hex 32` instead.

### Typesense 27.1
- **Role:** search index with facets across round-type × topics × outcome × trust tier (per ADR-0001)
- **Local dev:** Docker (`fromtheloop-typesense`, port 8108, API key `local-dev-key`)
- **Prod:** same container on Hetzner, internal-only (no host port binding yet)
- **Status:** image up, no index schema or data flow yet — Sprint 3 wires it
- **Notes:**
  - Healthcheck in compose uses `wget --spider http://localhost:8108/health`; intermittently flips to `unhealthy` — needs investigation before Sprint 3

## Background jobs

### BullMQ 5.34
- **Used by:** `apps/web` (producer side) and `apps/worker` (consumer side)
- **Queues:** `hello` (Sprint 0 demo). Sprint 1+ adds `aggregation`, `search-index`, `notifications`
- **Connection options:** `maxRetriesPerRequest: null` is **required** for the Worker (not optional — BullMQ throws if you set anything else)
- **Notes:**
  - Both `apps/web/lib/queue.ts` and `apps/worker/src/redis.ts` parse `REDIS_URL` into `ConnectionOptions` rather than constructing an `IORedis` instance directly — keeps us free of ioredis as a direct dependency
  - Queue singletons are cached per-function-instance on Vercel (cold start creates a new one)

### ioredis 5.x (transitive via BullMQ)
- Not a direct dep — pulled in by BullMQ
- Avoid `import IORedis from "ioredis"` in app code (causes duplicate-type errors when pnpm fails to dedupe)

## Operations on the Hetzner box

### Docker CE 29 + Compose v5
- Installed from Docker's official apt repo (Ubuntu's `docker.io` lags)
- Compose stack at `/opt/fromtheloop/docker-compose.prod.yml`

### systemd (`fromtheloop.service`)
- `Type=oneshot`, `RemainAfterExit=yes`, `Requires=docker.service`
- Brings the compose stack up at boot — satisfies the Sprint 0 reboot-resilience exit criterion

### ufw
- Default deny incoming, allow outgoing
- Open ports: **22** (SSH), **6380** (rediss). Everything else blocked.
- 6379 (plain Redis) and 8108 (Typesense) bound to the docker network only, never reachable from the internet

### fail2ban
- SSH brute-force protection, default Ubuntu config

### certbot + python3-certbot-dns-cloudflare
- Cert issuance + auto-renewal via `certbot.timer`
- Renewal hook restarts Redis so it picks up the new cert (no manual SIGHUP needed)

### bootstrap.sh
- Idempotent: pulls images (`--ignore-pull-failures` because the worker image is built locally), installs/updates the systemd unit, restarts the stack
- Run on the box from `/opt/fromtheloop/`

### Worker Docker image
- Multi-stage build at `apps/worker/Dockerfile`:
  1. **Builder:** `node:20-alpine`, `pnpm install --frozen-lockfile`, `tsc build`, `pnpm deploy --prod /out`
  2. **Runtime:** `node:20-alpine` + `tini`, `USER node`, runs `node dist/index.js`
- Built directly on the box (ARM, same arch as Mac M-series); no registry push needed
- `pull_policy: never` in compose so Docker doesn't try to fetch from a nonexistent registry

## Testing

### Vitest 4
- Test runner across the workspace (`pnpm test` recursively)
- Currently active in `packages/db`: 20 tests across migration shape, FK constraints, cascade behavior, enum rejection, type-level pgEnum drift, EXPLAIN index hits

### Testcontainers (`@testcontainers/postgresql`)
- Spins up Postgres 16 in Docker for db tests — no mocks. Real schema, real constraints, SQLSTATE assertions.
- ~2s suite runtime on a warm Docker daemon

## Dev tooling

### tsx 4.22
- ESM TypeScript runner for dev (`pnpm worker:dev` = `tsx watch src/index.ts`) and scripts (migrate, seed, enqueue)
- Production uses compiled `node dist/index.js` instead — tsx is dev-only

### ESLint 9 + `eslint-config-next`
- `next lint` for apps/web; per-package scripts elsewhere are placeholders for now

### corepack
- Resolves the pinned pnpm version automatically; enabled in CI and the worker Dockerfile

## External services (planned, not yet wired)

| Service | Purpose | Sprint |
|---|---|---|
| **Sentry** | Error tracking for Next.js + worker | 0 Day 7 |
| **Resend** | Transactional email | 0 Day 7 |
| **Cloudflare R2** | Object storage (user uploads, exports) | 0 Day 7 (bucket only) / Sprint 4 (wired) |
| **Cloudflare Email Routing** | `legal@pujan.tech` → personal inbox | 0 Day 7 |

## Local boot

```bash
pnpm docker:up                          # Postgres + Redis + Typesense in Docker
pnpm db:migrate && pnpm db:seed         # schema + one seed row
pnpm dev                                # Next.js dev server on :3000
pnpm worker:dev                         # BullMQ worker watching the local Redis
```

## Production boot (Hetzner box)

```bash
hcloud server create --type cax11 --location fsn1 \
  --image ubuntu-24.04 --ssh-key pujan-laptop \
  --user-data-from-file infra/hetzner/cloud-init.yaml \
  --name fromtheloop-worker-1
# wait for cloud-init: ssh root@<ip> 'test -f /var/lib/cloud-init-complete'
# generate /opt/fromtheloop/.env.prod with REDIS_PASSWORD + TYPESENSE_API_KEY
# rsync infra/hetzner/ to /opt/fromtheloop/, then:
ssh root@<ip> 'cd /opt/fromtheloop && bash bootstrap.sh'
```

Full procedure in [runbooks/hetzner-bootstrap.md](runbooks/hetzner-bootstrap.md).

## Cross-cutting gotchas already hit

| Gotcha | Root cause | Mitigation |
|---|---|---|
| `MIDDLEWARE_INVOCATION_FAILED` 500 on Vercel | Clerk env vars missing | Set all 6 Clerk vars on Vercel before first deploy of Day 3+ code |
| `WRONGPASS` retry storm hitting Vercel's 300s function limit | URL-encoded password in `REDIS_URL` didn't match what Redis was configured with | Use `openssl rand -hex 32` (URL-safe), regenerate locally, push to box, update Vercel, redeploy |
| SERVFAIL on `pujan.tech` after Cloudflare cutover | Orphaned DS record at the .tech registry while Cloudflare couldn't sign with the matching key | Turn off DNSSEC at registrar **before** flipping nameservers. Self-heals in 30–60 min if you forget. |
| `getaddrinfo ENOTFOUND box.pujan.tech` from Node/openssl on Mac | `mDNSResponder` cached the pre-A-record NXDOMAIN | `sudo killall -HUP mDNSResponder`. Only a local-dev nuisance; Vercel never sees this. |
| TypeScript duplicate-identity errors on `ioredis` | pnpm resolving two versions because both `bullmq` and our own `package.json` requested it | Don't depend on `ioredis` directly — let BullMQ provide it transitively. Use `ConnectionOptions` shape instead of `IORedis` instance. |
| Vercel function timing out 4.8 min on `fetch` | ioredis retry strategy is infinite by default; with wrong password, it retries until Vercel kills the function | Either fix the credential or set `retryStrategy: () => null` to fail fast. We rely on Vercel's 300s timeout for now. |
