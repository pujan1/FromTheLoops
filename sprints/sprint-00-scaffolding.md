# Sprint 0 — Scaffolding & Infra

> **Weeks 1–2** · Solo · Pre-alpha

## Goal

Stand up every piece of infrastructure end-to-end (deploy → DB → search → worker → auth → errors) so that Sprint 1 can write feature code, not configure tools.

## Why now

This is the only sprint where infra setup doesn't block user-visible value. If any of these tools turns out to be a bad fit, sprint 0 is when we still have room to swap. Sprint 1 onward, the stack is frozen.

## In scope

- Monorepo layout (`apps/web`, `apps/worker`, `packages/db|search|core|shared`, `infra/`)
- Next.js 15 App Router on Vercel — empty home page deploys
- Neon Postgres (free tier) — `dev`, `staging`, `prod` branches
- Clerk auth — sign-up / sign-in working on `/dashboard` stub
- Hetzner CX22 provisioned with Docker — Typesense + Redis + worker placeholder running
- BullMQ worker process — connects to Redis, processes a "hello" job
- Sentry wired into both Next.js and worker
- Resend account set up; `legal@` email routing on Cloudflare configured
- R2 bucket created (not yet integrated)
- GitHub Actions CI: typecheck + lint + test on PR
- `.env.example` covering every variable used
- `pnpm db:migrate` and `pnpm db:seed` scripts (with one trivial seed row)
- Local `docker compose` for Postgres + Redis + Typesense

## Out of scope

- Any feature work (submission, search, profiles…)
- Real seed data (placeholder row only — real seeding starts Sprint 1's taxonomy work)
- Auth roles/RBAC (Sprint 6)
- next-intl wiring (Sprint 1 — paired with first user-facing form)

## Deliverables

| Artifact | Where |
|---|---|
| Deployed Vercel preview at `<project>.vercel.app` | Vercel |
| Hetzner box reachable, Docker stack running | `ssh hetzner` shows `docker ps` with 3 services |
| `pnpm dev` boots Next.js with DB + Clerk session | local |
| `pnpm worker:dev` connects to Redis, logs job processed | local |
| Sentry receives a deliberate test error from each app | sentry.io |
| `.env.example` checked in, no real secrets in git | repo |
| `docs/adr/0001-stack-choice.md` — link to PLAN.md decision | repo |
| `docs/runbooks/hetzner-bootstrap.md` — reproducible box setup | repo |

## Exit criteria

- [x] Empty Next.js homepage deploys to Vercel from `main` automatically
- [x] A new branch + PR triggers CI; CI runs typecheck + lint + tests
- [x] Local dev boots cold in <2 minutes from a fresh clone, following only `README.md`
- [x] Clerk login works on deployed Vercel preview, session round-trips to Postgres
- [x] Hetzner box survives a reboot (systemd / docker restart policies set)
- [x] One test error from Next.js and one from worker visible in Sentry
- [x] All env vars documented in `.env.example` with comments
- [ ] Cost estimate verified: ~$5/mo (Hetzner) + free tiers — checked on each provider's dashboard

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Hetzner box setup eats 3 days because Docker networking / Typesense config is finicky | Time-box to 2 days. If stuck, fall back to Typesense Cloud free tier; revisit self-host later. |
| Vercel + Next.js 15 App Router edge cases (server actions, ISR) bite mid-sprint | Stay on RSC + route handlers initially; reach for server actions only when proven needed. |
| Clerk free-tier limits surprise us | Read pricing page; document MAU ceiling in `docs/adr/0001-stack-choice.md`. |

## Dependencies

- None (sprint 0 has no upstream).
- Domain name purchased before this sprint starts (needed for Cloudflare email + Clerk).

## Day-by-day skeleton

| Day | Focus |
|---|---|
| 1 | Monorepo skeleton, Next.js app, deploy first commit to Vercel |
| 2 | Neon project, Postgres schema bootstrap, Drizzle/Prisma chosen + wired |
| 3 | Clerk integration, `/dashboard` stub gated, session → user row in DB |
| 4 | Hetzner provision, base Docker compose for Typesense + Redis |
| 5 | Worker app skeleton, BullMQ "hello" job runs locally |
| 6 | Worker deployed to Hetzner, queue round-trip works from Vercel |
| 7 | Sentry wired both sides, R2 bucket, Resend account, Cloudflare `legal@` |
| 8 | CI pipeline (lint/typecheck/test), `.env.example`, `docker compose` for local dev |
| 9 | Documentation: README boot steps, runbooks/hetzner-bootstrap.md, ADR-0001 |
| 10 | Buffer / catch-up / exit criteria walkthrough |

## Notes & decisions

_Append-only during the sprint._

- 2026-05-23: Day 1 deploy verified at `https://from-the-loops-web.vercel.app/` (HTTP 200 from Vercel). Local `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` passed.
- 2026-05-23: Day 2 — Drizzle wired in `packages/db/`. `drizzle.config.ts`, db client (`getDb` / `closeDb`), and a `tsx`-based migrate + seed runner all live. First migration `0000_bizarre_black_cat.sql` generated (10 tables: 5 top-level entities — `interview_reports`, `rounds`, `questions`, `user_verifications`, `mod_action_logs` — plus supporting `users`, `companies`, `roles`, `topics`, `question_topics`). Verified end-to-end against local docker-compose Postgres: `pnpm docker:up && pnpm db:migrate && pnpm db:seed` succeeds; repeat runs are idempotent. Neon project setup deferred — local-only today; runbook to follow.
- 2026-05-23: Day 2 — **scope expansion**: full five top-level entities landed (instead of trivial placeholder), pulling forward what Sprint 2 had planned. Field set tracks PLAN.md §Data model. Level is text-on-report for now; Sprint 1 will introduce a per-company `levels` lookup and migrate to FK.
- 2026-05-23: Day 2 — `packages/db/tests/` set up with **vitest 4 + testcontainers (Postgres 16)**. 20 tests across 4 files: migration shape (tables, indexes, journal), constraints (FK reject, cascade report→rounds→questions, RESTRICT on user delete, unique on `companies.slug` and `rounds (report_id, order_index)`, enum reject via raw SQL — all asserted by SQLSTATE code), type-level enum unions for every pgEnum (compile-time drift catches schema regressions), and EXPLAIN on the wedge-page lookup confirming `reports_company_role_level_idx` is hit. Suite runs in ~2s locally on a warm Docker daemon. CI (`pnpm test`) now does real work.
- 2026-05-27: Day 4 — **Hetzner box provisioned via `hcloud` CLI + cloud-init.** Substitution from PLAN: `cax11` in `fsn1` (Falkenstein, ARM, 4 GB RAM, €4.30/mo) instead of `cx22` in `ash` — the EU-only SKU isn't sold in Ashburn, and the US alternatives were either under-RAM'd (`cpx11` 2 GB) or 3× the budget (`cpx21` ~$15/mo). Trade-off accepted: ~100ms search-latency penalty for US users when Typesense ships in Sprint 3, mitigatable later by moving to `cpx21` or putting Typesense Cloud's free tier in front (already noted as a Sprint 0 risk fallback). Cloud-init handles all hardening (Docker CE from official repo, ufw default-deny, fail2ban, SSH key-only). `bootstrap.sh` + `systemd/fromtheloop.service` bring up `docker-compose.prod.yml` with Redis + Typesense + worker-placeholder (busybox until Day 6). **Reboot resilience verified end-to-end**: `systemctl reboot` → all 3 services back up in <30s, no manual intervention. Box IPv4 `178.105.212.199`. Runbook rewritten as the exact CLI procedure executed, not click-through.
- 2026-05-27: Day 5 — **`apps/worker` scaffold: BullMQ 5 + tsx watch.** Structure: `src/redis.ts` (parses `REDIS_URL` into BullMQ `ConnectionOptions`, no direct `ioredis` dep to avoid type-tree duplication), `src/jobs/hello.ts` (processor + typed `HelloJobData`), `src/index.ts` (Worker with ready/completed/failed listeners + SIGINT/SIGTERM shutdown), `src/scripts/enqueue-hello.ts` (manual producer). `pnpm worker:dev` boots, connects to local Redis, listens on `hello` queue; `pnpm enqueue:hello` round-trips a job and the worker logs `[hello] job N: ...` then `[worker] completed N`. End-to-end smoke test passes locally. Day 6 will swap the busybox placeholder on Hetzner for the real worker image and wire Vercel → queue.
- 2026-05-27: Day 4/7 prep — **domain `pujan.tech` (Squarespace registrar) being moved to Cloudflare DNS.** Cloudflare's scan picked up the existing GitHub Pages records (4 × `185.199.108-111.153` A on apex + `www` CNAME → `pujan1.github.io`); all 5 set to gray-cloud (DNS only) to avoid SSL-handshake issues during cutover. Nameservers assigned: `arvind.ns.cloudflare.com` / `carol.ns.cloudflare.com`. Pending: user flips NS at Squarespace and turns DNSSEC off first to avoid signature-mismatch blackhole. Subdomain plan: `loops.pujan.tech` → Vercel (web), `box.pujan.tech` → Hetzner IPv4 (internal), `legal@pujan.tech` via Cloudflare Email Routing on Day 7. Path-based routing under `pujan.tech/fortheloops` rejected — would require proxying through Cloudflare Workers for everything including the portfolio.
- 2026-05-27/28: NS migration **completed** for `pujan.tech` (Cloudflare now authoritative). Transient ~30 min DNSSEC-bogus window after the flip — the .tech registry was still serving an old DS record while Cloudflare couldn't sign with the matching key, so validating resolvers (1.1.1.1, 8.8.8.8, 9.9.9.9) returned SERVFAIL. Self-healed once the DS removal propagated. `box.pujan.tech` A record added → `178.105.212.199`, DNS-only.
- 2026-05-28: Day 7 — **Sentry wired into both apps (code complete; dashboard setup pending).** Web uses the modern Next.js 15 manual layout per current Sentry docs: `instrumentation.ts` (loads `sentry.server.config.ts` / `sentry.edge.config.ts` by `NEXT_RUNTIME`, exports `onRequestError`), `instrumentation-client.ts` (exports `onRouterTransitionStart`), `app/global-error.tsx` boundary, and `withSentryConfig` wrapping the existing webpack-resolver config in `next.config.ts`. Worker uses `@sentry/node` via `src/sentry.ts`, imported first in `src/index.ts` so global handlers register early; the `failed` listener now calls `captureException` with queue/job tags. Both inits read DSN from env and **no-op when unset**, so local dev + CI need no real DSN. Deliberate test-error triggers added: web `GET /api/debug-sentry` (throws → caught by `onRequestError`), worker `pnpm sentry:test` (`src/scripts/throw-test.ts`, captures + flushes before exit). Deliberately omitted Replay/Feedback integrations (bundle weight) and set `sendDefaultPii: false` (product handles interview PII). SDKs: `@sentry/nextjs` + `@sentry/node` both `^10.55.0`. `.env.example` Sentry block expanded with per-var comments + `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT`. **Remaining (needs dashboard logins, documented in `docs/runbooks/external-services.md`):** create Sentry org + 2 projects (web=Next.js, worker=Node), set DSNs in Vercel + box, then verify one test error from each lands in Sentry; create R2 bucket `fromtheloop-uploads` (integration deferred); Resend account + verified sending domain + API key; Cloudflare Email Routing for `legal@pujan.tech`.
- 2026-05-28: Day 8 — **CI hardened; lint now does real work on the worker.** `apps/worker` lint was an `echo TODO` placeholder; replaced with a real typescript-eslint flat config (`eslint.config.mjs`: `js.recommended` + `tseslint.recommended`, type-aware `projectService` scoped to `src/**/*.ts`, config file + `dist/` ignored) and the `lint` script flipped to `eslint .`. Pinned `@eslint/js@^9` to match the repo's eslint 9 (the `add` default pulled v10, peer-mismatched). The existing `.github/workflows/ci.yml` (typecheck + lint + test on PR/push to main) needs no change — the db testcontainers suite was already written CI-aware (ubuntu-latest ships Docker). `.env.example` already covered every var; confirmed current. Local CI mirror all green: `pnpm typecheck`, `pnpm lint` (worker now real eslint), `pnpm test` (20/20 db tests), `pnpm --filter web build`. **Remaining exit criterion:** confirm CI triggers + goes green on GitHub (push to main / PR).
- 2026-05-29: Day 9 — **cold-boot exit criterion verified.** Fresh `git clone` of `main` (HEAD f0ad136) into a throwaway dir, followed README §Local development verbatim, all timed: clone 1.6s → `pnpm install` 5s (warm pnpm store, `reused 662 downloaded 0`) → `pnpm docker:up` 1s (images cached) → `pnpm db:migrate` 1.7s (no Postgres-readiness race in practice) → `pnpm db:seed` ok (`companies rows: 1`) → `pnpm dev` served HTTP 200 on `:3000` in ~11s. ~22s active total, well under the 2-min budget. Also tested the true new-dev case with **pristine `.env.example` (empty Clerk keys)**: `/` still 200s in 9s because Clerk falls back to **keyless mode** (auto-provisions a temp dev instance, prints a claim link) — so missing keys don't block boot. Caveats noted in README: the warm numbers assume a primed pnpm store + cached Docker images; a brand-new machine additionally downloads ~662 packages and pulls the postgres/redis/typesense images (first-pull dominates wall time). README updated: Status block de-staled ("Sprint 0 in progress ~Day 8/10", repo state), local-dev section un-hedged + keyless-mode and first-pull notes added.
- 2026-05-29: Day 9 — **Sentry end-to-end verified for both apps; exposed (and fixed) two deploy-drift gaps.** Two separate Sentry projects under org `fromtheloops`: `fromtheloops-web` (DSN `…/4511470396899328`) and `fromtheloops-worker` (DSN `…/4511470418132992`). *Web:* `GET /api/debug-sentry` now lands in `fromtheloops-web`. Root cause of the initial miss was a **wrong DSN value in Vercel** env (server-side `SENTRY_DSN` must match the web project's DSN; `NEXT_PUBLIC_*` is build-time inlined so it needs a redeploy). Corrected the value + redeployed → captured. *Worker:* fires via `docker exec fromtheloop-worker node -e "import('/app/dist/sentry.js') → captureException → flush"`; landed in `fromtheloops-worker`. Getting there required fixing **two stale artifacts on the box that never got updated after Day 7**: (1) `/opt/fromtheloop/docker-compose.prod.yml` predated the worker `environment:` Sentry lines, so `SENTRY_DSN` was never injected even after adding it to `.env.prod` — `docker inspect` showed the var entirely absent; fixed by scp'ing the current compose file over; (2) the **`fromtheloop-worker:latest` image itself was a Day-6 build with no `dist/sentry.js` and no `@sentry/node`** — rebuilt for `linux/arm64` on the Mac (`docker buildx … --provenance=false --output type=docker`), shipped as a 54 MB gzipped tar via scp + `docker load`, recreated the container. **Follow-up (Sprint 1):** the worker image build + ship is undocumented in `hetzner-bootstrap.md` and not part of `bootstrap.sh`/CI, so the box silently runs whatever was last hand-built — needs a documented (ideally automated) "rebuild + redeploy worker" step so image/compose drift can't recur.
- 2026-05-29: Day 3 exit-criterion verified on deployed preview — **Clerk login + Postgres round-trip confirmed end-to-end.** Google OAuth sign-in works on `from-the-loops-web.vercel.app` (Clerk `pk_test_…` dev instance; incognito correctly gates `/dashboard`). Note on dev-instance behavior: a cookieless request (e.g. `curl`) to a protected route gets `x-clerk-auth-reason: protect-rewrite, dev-browser-missing` and a rewrite to `/404` rather than a redirect to sign-in — expected for Clerk dev instances, not a bug; a real browser passes the handshake. `/dashboard` body renders "Signed in as … upserted into `users`", proving the upsert-on-visit write to the DB succeeds in production. **Correction to the Day-2 note:** Neon *is* provisioned and `DATABASE_URL` is set in Vercel prod (wired via the Vercel dashboard); only local dev still points at docker-compose `localhost` (both `.env.local` files). Neon connection string is not stored on disk locally.
- 2026-05-28: Day 6 — **Vercel → Hetzner queue round-trip live.** Architecture: Redis on box exposes `rediss://` on port 6380 (TLS via Let's Encrypt cert for `box.pujan.tech`, DNS-01 challenge through Cloudflare API, certbot auto-renewal + deploy hook that copies certs into `/opt/fromtheloop/certs` and reloads Redis). Internal `redis://redis:6379` (plain) still serves the worker over the docker network. Worker image built locally on the box via `apps/worker/Dockerfile` (multi-stage: pnpm install → tsc build → `pnpm deploy --prod` → runtime layer with `node:20-alpine` + tini, runs as `USER node`). `docker-compose.prod.yml` swapped from busybox to `fromtheloop-worker:latest`, `pull_policy: never` + `bootstrap.sh --ignore-pull-failures` so the locally-built image isn't pulled from a nonexistent registry. Box-side round-trip verified: one-off enqueue container → worker logs `[hello] job N: ...` → `[worker] completed N`. Web side: `apps/web/app/api/hello/enqueue/route.ts` (Clerk `auth.protect()` gated, lazy BullMQ Queue init), `apps/web/lib/queue.ts` shares the URL→ConnectionOptions parser pattern from `apps/worker/src/redis.ts`. Local laptop note: macOS `mDNSResponder` cached the pre-A-record NXDOMAIN for `box.pujan.tech`, so Node/openssl `getaddrinfo` fails until cache flush (`sudo killall -HUP mDNSResponder`) — `dig` works because it queries 1.1.1.1 directly; not a server-side problem.
