# Runbook — Hetzner box bootstrap

> **Re-provisioning target: <1 hour from a fresh Hetzner project.** This page is the entire procedure — if it takes longer, the runbook itself is broken. Mitigation for the single-point-of-failure called out in [ADR-0001](../adr/0001-stack-choice.md#negative).

## What this provisions

A single Hetzner `cax11` box in Falkenstein (`fsn1`) running:

| Service | Image | Purpose |
|---|---|---|
| `fromtheloop-redis` | `redis:7-alpine` | BullMQ queue + cache |
| `fromtheloop-typesense` | `typesense/typesense:27.1` | Search index |
| `fromtheloop-worker` | (placeholder until Day 6, then app image) | BullMQ consumer |

Cost: ~€3.79/mo for the box + €0.50/mo for the IPv4 ≈ **€4.30/mo (~$4.60)**.

### Why cax11 / Falkenstein (and not cx22 / Ashburn as PLAN.md called)

`cx22` (the spec named in PLAN.md) is EU-only — Hetzner's US Ashburn region doesn't carry it. US alternatives:

- `cpx11` — 2 GB RAM, ~$7.50/mo — under-RAM'd for Typesense + Redis + worker.
- `cpx21` — 4 GB RAM, ~$15/mo — 3× the original budget.

`cax11` in Falkenstein delivers the same 4 GB RAM at the original cost. The cost: search queries from the US Vercel edge to Falkenstein add ~100 ms. Acceptable pre-launch; mitigation when latency becomes real is either (a) move to `cpx21` in Ashburn, or (b) put Typesense Cloud's free tier in front of search (already noted as a Sprint 0 risk fallback). Recorded in [ADR-0001](../adr/0001-stack-choice.md).

## Prerequisites

- [ ] `hcloud` CLI installed locally — `brew install hcloud`
- [ ] Hetzner Cloud project + Read/Write API token stored in `.env.local` as `HCLOUD_TOKEN`
- [ ] SSH keypair (default: `~/.ssh/id_ed25519.pub`)
- [ ] This repo cloned

## Step 1 — Load token + register SSH key (one-time)

```bash
set -a && source .env.local && set +a
hcloud ssh-key create --name pujan-laptop --public-key-from-file ~/.ssh/id_ed25519.pub
```

## Step 2 — Provision the box

```bash
hcloud server create \
  --name fromtheloop-worker-1 \
  --type cax11 \
  --image ubuntu-24.04 \
  --location fsn1 \
  --ssh-key pujan-laptop \
  --user-data-from-file infra/hetzner/cloud-init.yaml \
  --label env=prod \
  --label role=worker
```

The cloud-init in `infra/hetzner/cloud-init.yaml` runs on first boot (~3 min) and installs:

- Docker CE from Docker's official apt repo (Ubuntu's `docker.io` lags)
- `ufw` — default-deny incoming, port 22 open
- `fail2ban` for SSH brute-force protection
- SSH hardening — `PermitRootLogin prohibit-password`, `PasswordAuthentication no`
- Sysctl tuning for Redis — `vm.overcommit_memory=1`, `net.core.somaxconn=1024`

Wait for cloud-init to finish:

```bash
IP=$(hcloud server ip fromtheloop-worker-1)
until ssh -o BatchMode=yes root@$IP 'test -f /var/lib/cloud-init-complete'; do sleep 15; done
```

## Step 3 — Generate prod secrets

Done locally so the box never sees the originals in plaintext on disk outside `.env.prod`:

```bash
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"     >  infra/hetzner/.env.prod
echo "TYPESENSE_API_KEY=$(openssl rand -base64 32)"  >> infra/hetzner/.env.prod
```

`.env.prod` is gitignored.

## Step 4 — Ship the stack and start it

```bash
IP=$(hcloud server ip fromtheloop-worker-1)
ssh root@$IP 'mkdir -p /opt/fromtheloop'
rsync -av --exclude '.env.prod.example' --exclude 'README.md' \
  infra/hetzner/ root@$IP:/opt/fromtheloop/
ssh root@$IP 'cd /opt/fromtheloop && bash bootstrap.sh'
```

`bootstrap.sh` is idempotent: pulls images, installs the systemd unit if changed, restarts the service. Re-run anytime to apply config changes.

Expected output: three rows in `docker ps` — `fromtheloop-redis`, `fromtheloop-typesense`, `fromtheloop-worker`, all `Up (healthy)`.

## Step 5 — Verify reboot resilience

```bash
ssh root@$IP 'reboot'
sleep 60
ssh root@$IP 'docker ps --format "{{.Names}}\t{{.Status}}"'
```

All three services should be `Up` again without manual intervention — the `fromtheloop.service` systemd unit (installed by `bootstrap.sh`) brings the stack up after `docker.service` is ready. Satisfies the Sprint 0 exit criterion *"Hetzner box survives a reboot"*.

## Step 6 — DNS

Once `pujan.tech` is on Cloudflare nameservers, add:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `box` | `<IPv4 from `hcloud server ip fromtheloop-worker-1`>` | DNS only |

Gray-cloud because `box.pujan.tech` is for SSH and (eventually) internal queue/index access — there's no HTTP origin to proxy.

## Step 7 — External access decisions (Day 6+)

As of Day 4 the stack is **not exposed publicly** — Redis and Typesense are bound to the Docker network only. Day 6 will decide how Vercel reaches them. Candidates:

- Cloudflare Tunnel — best security, no inbound firewall hole, free tier OK
- TLS-fronted ports (`rediss://`) with IP allowlist via `ufw` — simpler, but Vercel's outbound IPs are not a fixed set
- WireGuard / Tailscale — overkill for one box

Defer until Day 6 when we know the real failure modes.

## Tear down

```bash
hcloud server delete fromtheloop-worker-1
```

Costs stop immediately. Data on the box is lost — Redis AOF and the Typesense index live on the box's local disk only. Restore by re-running this runbook + re-indexing from Postgres (which lives on Neon, not here).
