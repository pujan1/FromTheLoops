# infra/

Anything that touches a machine, a cloud account, or a CI runner.

## Layout

| Path | Purpose |
|---|---|
| [hetzner/](hetzner/) | Provisioning scripts + Docker compose for the CX22 box (Typesense + Redis + worker) |
| [../docker-compose.yml](../docker-compose.yml) | Local-dev mirror of the Hetzner stack (lives at repo root for ergonomic `docker compose up`) |
| [../.github/workflows/](../.github/workflows/) | GitHub Actions — CI on PR, deploy hooks |

## Sprint 0 deliverables

- Hetzner CX22 provisioned, Docker installed, compose stack running
- Reproducible bootstrap documented in [docs/runbooks/hetzner-bootstrap.md](../docs/runbooks/hetzner-bootstrap.md)
- `systemd` / Docker restart policies survive a reboot

## Not in here

- Vercel config → in [apps/web/](../apps/web/) (`next.config.js`, `vercel.json` if needed)
- Neon project setup → manual via Neon dashboard; documented in the bootstrap runbook
