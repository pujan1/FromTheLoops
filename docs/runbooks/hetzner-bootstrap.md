# Runbook — Hetzner CX22 bootstrap

> Goal: take a fresh CX22 from "just created in Hetzner Cloud console" to "worker, Typesense, and Redis running and survive a reboot" in **under one hour**.

This runbook is a **mitigation** for the single-point-of-failure noted in [ADR-0001](../adr/0001-stack-choice.md#negative). If the box dies, re-provisioning from this doc is the recovery path.

---

## Prereqs

- [ ] Hetzner Cloud account, billing set up
- [ ] SSH key uploaded in the Hetzner console
- [ ] Domain ready (DNS not required for boot, only for TLS termination later)
- [ ] Filled-in `infra/hetzner/.env.prod` locally (do **not** commit)

## Step 1 — Create the box

In the Hetzner Cloud console:

1. Location: closest to most users (Ashburn for US tech beachhead)
2. Image: **Ubuntu 24.04**
3. Type: **CX22** (~€5/mo)
4. Networking: IPv4 + IPv6, defaults are fine
5. SSH key: select the one already uploaded
6. Name: `fromtheloop-prod-01`

Note the public IPv4 — referred to below as `$HETZNER_IP`.

## Step 2 — First SSH + harden

```bash
ssh root@$HETZNER_IP

# Create a non-root user
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# Disable root SSH + password auth
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Basic firewall — only SSH from the public internet
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable
```

Reconnect as `deploy@$HETZNER_IP` before continuing.

## Step 3 — Install Docker

```bash
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# log out and back in so the group takes effect
```

## Step 4 — Pull the stack

```bash
# Once infra/hetzner/ has the prod compose file, scp it up:
#   scp infra/hetzner/docker-compose.prod.yml deploy@$HETZNER_IP:~/compose.yml
#   scp infra/hetzner/.env.prod deploy@$HETZNER_IP:~/.env

docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml up -d
docker compose ps   # all 3 services healthy
```

## Step 5 — Survive a reboot

```bash
# Systemd unit pinned in infra/hetzner/systemd/fromtheloop.service.
# Install it once:
sudo cp fromtheloop.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fromtheloop.service

# Verify
sudo reboot
# wait ~30s, then:
ssh deploy@$HETZNER_IP 'docker compose ps'   # all 3 still up
```

This satisfies the Sprint 0 exit criterion *"Hetzner box survives a reboot"*.

## Step 6 — Verify from outside

- [ ] Vercel app can connect to Redis via the box's public IP (TLS later — Sprint 7)
- [ ] `redis-cli -h $HETZNER_IP -a $REDIS_PASSWORD ping` returns `PONG`
- [ ] `curl http://$HETZNER_IP:8108/health` returns `{"ok":true}`
- [ ] Worker logs (`docker compose logs -f worker`) show it draining the `hello` queue

## Tearing down

```bash
docker compose down -v   # removes volumes too — DESTRUCTIVE
```

To rebuild from scratch: blow the box away in the Hetzner console, repeat from Step 1.

---

## Open items

- TLS termination + Caddy reverse proxy → Sprint 7
- Daily Postgres backup via `pg_dump` on this box → Sprint 7
- Hetzner snapshot before risky upgrades → manual, document the cadence after first incident
