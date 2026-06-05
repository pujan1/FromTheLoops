# Runbook — Deploy the worker (and migrate prod)

> **Last verified: 2026-06-04** (Sprint 3 Days 5–8 deploy — Typesense indexer).

The worker does **not** auto-deploy. Unlike the Vercel web app (which builds on `git push`), the worker image is built **by hand on the Hetzner box** from source you ship there, and the database is migrated **by hand** against Neon. A release that changes worker code *and* the schema is therefore **three separate manual moves**. Skipping any one of them is the usual cause of a "I deployed but nothing changed" afternoon.

This is the standing reality behind the project's "worker deploy is manual" note — the box silently drifts from the repo until you run this.

## Mental model — the three things that live in different places

| Thing | Where it lives on the box | Updated by |
|---|---|---|
| Worker **source → image** | `/opt/fromtheloop/build/` (full repo source) → `fromtheloop-worker:latest` image | rsync **+ `docker build`** |
| **Config** (compose / bootstrap / systemd) | `/opt/fromtheloop/` (top level) | copy the file up |
| **DB schema** | Neon (not on the box at all) | `pnpm db:migrate` from your Mac |

`bootstrap.sh` only **restarts** — it never builds and never migrates. If you re-run it and see `Image fromtheloop-worker:latest Skipped`, that's Docker telling you the image wasn't rebuilt.

## Prerequisites

- [ ] SSH access to the box: `ssh root@box.pujan.tech`
- [ ] The repo on your Mac with the changes you want to ship (committed or not — rsync ships the working tree)
- [ ] Docker running on the box (it always is; the stack runs under systemd)

---

## Decide what you need

- **Worker code changed** (anything under `apps/worker/` or `packages/*` the worker imports) → do **Part A**.
- **Compose / env changed** (`infra/hetzner/docker-compose.prod.yml`, new env var) → also do **Part B**.
- **DB schema changed** (a new file in `packages/db/src/migrations/`) → also do **Part C**.

When in doubt, do all three in order. They're idempotent — re-running a part that wasn't needed is a no-op.

---

## Part A — Ship + build the worker image

**1. On your Mac**, push the working tree into the box's build dir:

```bash
cd /Users/pujan/Desktop/FromTheLoops
rsync -av --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude '.next' \
  ./ root@box.pujan.tech:/opt/fromtheloop/build/
```

`build/` is plain copied-in source (not a git checkout), so **no commit/push is needed** — what's in your working tree is what ships. The Dockerfile re-runs `pnpm install` itself, hence the `node_modules` exclude.

**2. On the box**, build the image and restart:

```bash
cd /opt/fromtheloop/build
docker build -t fromtheloop-worker:latest -f apps/worker/Dockerfile .
cd /opt/fromtheloop && ./bootstrap.sh
```

The `docker build` is the actual deploy (a minute or two). `bootstrap.sh` then restarts onto the fresh image.

---

## Part B — Apply a compose / env change

The compose file the box runs is the **top-level** `/opt/fromtheloop/docker-compose.prod.yml`. Your rsync only updated the copy under `build/infra/hetzner/`, so promote it:

```bash
# on the box
cp /opt/fromtheloop/build/infra/hetzner/docker-compose.prod.yml /opt/fromtheloop/docker-compose.prod.yml
```

If you added a **new env var** the compose references (e.g. `TYPESENSE_API_KEY`), make sure it has a value in `/opt/fromtheloop/.env.prod` — a `${VAR:?...required}` reference makes the stack refuse to start if it's missing:

```bash
grep TYPESENSE_API_KEY /opt/fromtheloop/.env.prod   # must print a value
```

Then restart onto the new config:

```bash
cd /opt/fromtheloop && ./bootstrap.sh
```

---

## Part C — Migrate the production database

The worker image carries **code**, not schema. A new migration file means Neon is behind until you run it. Migrations run **from your Mac** against the prod URL.

Pull the URL without printing it (it's a secret — don't paste it into a terminal you're sharing):

```bash
# on your Mac, from the repo root
DATABASE_URL=$(ssh root@box.pujan.tech 'grep -h DATABASE_URL /opt/fromtheloop/.env.prod | cut -d= -f2-') \
  pnpm --filter @fromtheloop/db migrate
```

Expect `migrations applied`. If Neon offers a **direct (non-pooled)** connection string, prefer it for migrations (DDL is happier without PgBouncer in front); the pooled URL usually works too.

> The worker tolerates a missing table gracefully — its 30s sweep just retries and logs `relation "..." does not exist` until you migrate. So the order Part-A-then-Part-C is fine; the errors stop on the next sweep tick after the migration lands. No worker restart needed.

---

## Verify

```bash
# on the box
docker logs fromtheloop-worker 2>&1 | head -20    # boot lines
docker logs fromtheloop-worker 2>&1 | tail -15    # recent activity
```

Healthy boot (first deploy of the search work) shows:

```
[worker] typesense collections: reports=created companies=created topics=created
[event-listener] LISTEN events → refresh-aggregate, index-typesense
[worker] ready — queue=refresh-aggregate ...
[worker] ready — queue=index-typesense ...
```

(Subsequent deploys say `collections: ...=exists`.) The `tail` should show `completed repeat:*-sweep:...` lines and **no** stack traces. An idle, healthy worker is mostly silent — the sweeps no-op every 30s when there's nothing to process.

`docker ps` should show all three up:

```
fromtheloop-worker      Up ... 
fromtheloop-redis       Up ... (healthy)
fromtheloop-typesense   Up ... (healthy)
```

## Rollback

- **Bad image:** the previous image isn't tagged separately, so the fastest rollback is to `git stash`/checkout the known-good source on your Mac, re-run Part A. (Improvement: tag images `fromtheloop-worker:<git-sha>` so you can `docker tag` back instantly — TODO.)
- **Bad compose change:** `git -C /opt/fromtheloop/build checkout` the old file, re-copy it up (Part B), `./bootstrap.sh`.
- **Bad migration:** migrations are forward-only here. Restore Neon from a branch/point-in-time snapshot (see `backup-restore.md` once it exists). Prefer additive, reversible migrations to avoid this.

## Common failure → cause

| Symptom in `docker logs` | Cause | Fix |
|---|---|---|
| `Image ... Skipped` on bootstrap, no new boot lines | never ran `docker build` | Part A step 2 |
| `ECONNREFUSED` to Typesense, falls back to `localhost` | worker env missing `TYPESENSE_HOST=typesense` | Part B (compose not promoted) |
| `relation "events"/"aggregates_..." does not exist` | prod DB not migrated | Part C |
| stack won't start, `TYPESENSE_API_KEY required` | env var missing in `.env.prod` | add it, `./bootstrap.sh` |
