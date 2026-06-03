# systemd

## Role In FromTheLoop

systemd keeps the production Docker compose stack attached to machine boot. It starts Redis, Typesense, and the worker after Docker and networking are ready.

## Where It Lives

- Unit file: `infra/hetzner/systemd/fromtheloop.service`
- Installed by: `infra/hetzner/bootstrap.sh`
- Production compose file: `infra/hetzner/docker-compose.prod.yml`

## Workflow Integration

The unit is a one-shot service that brings compose up and records the stack as active:

```ini
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/fromtheloop
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.prod down
TimeoutStartSec=300
```

This satisfies the reboot-resilience requirement for the Hetzner box.

## Tradeoffs And Gotchas

- systemd is simple and already present on Ubuntu.
- Compose still owns individual container restart policy.
- `RemainAfterExit=yes` means the service can appear active even though one container failed later. Check Docker health and logs for service-level status.
- Changes to the unit require daemon reload and service restart, which `bootstrap.sh` should handle.

## Common Workflow

1. Edit `infra/hetzner/systemd/fromtheloop.service` if boot behavior changes.
2. Sync infra to the box.
3. Run `bootstrap.sh`.
4. Verify with `systemctl status fromtheloop.service` and `docker ps`.
