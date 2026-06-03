# Hetzner Cloud

## Role In FromTheLoop

Hetzner runs the self-hosted backend services that need long-lived processes: Redis, Typesense, and the BullMQ worker. The current instance is a cax11 ARM box in Falkenstein.

## Where It Lives

- Infra folder: `infra/hetzner/`
- Cloud-init: `infra/hetzner/cloud-init.yaml`
- Production compose: `infra/hetzner/docker-compose.prod.yml`
- Systemd unit: `infra/hetzner/systemd/fromtheloop.service`
- Runbook: `docs/runbooks/hetzner-bootstrap.md`

## Workflow Integration

Provisioning starts from the `hcloud` CLI and then the repo's bootstrap script:

```bash
hcloud server create --type cax11 --location fsn1 \
  --image ubuntu-24.04 --ssh-key pujan-laptop \
  --user-data-from-file infra/hetzner/cloud-init.yaml \
  --name fromtheloop-worker-1
```

On the box, `fromtheloop.service` starts the compose stack at boot.

## Tradeoffs And Gotchas

- The box keeps alpha infra near the target budget.
- It is a single point of failure for worker, Redis, and Typesense.
- Falkenstein adds latency for US users, especially search.
- ARM is fine for the current stack, but image choices should support ARM.
- Re-provisioning should stay under one hour, so runbooks and bootstrap scripts matter.

## Common Workflow

1. Update infra files in `infra/hetzner`.
2. Sync them to `/opt/fromtheloop` on the box.
3. Run `bash bootstrap.sh`.
4. Check `docker ps`, Redis health, Typesense health, and worker logs.
