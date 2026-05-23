# infra/hetzner/

Provisioning + runtime config for the single Hetzner CX22 box that hosts the worker, Typesense, and Redis.

## Target layout (populated during Sprint 0, Day 4–6)

```
hetzner/
├── docker-compose.prod.yml   # Typesense + Redis + worker (image pulled from registry)
├── bootstrap.sh              # one-shot: install Docker, create user, set firewall, pull stack
├── systemd/
│   └── fromtheloop.service   # ensures the compose stack starts on boot
└── .env.prod.example         # vars the box needs (mirror root .env.example, prod values)
```

## Why this exists

The box is a single point of failure (called out in [ADR-0001](../../docs/adr/0001-stack-choice.md#negative)). The mitigation is: re-provisioning takes <1 hour from these files plus the [runbook](../../docs/runbooks/hetzner-bootstrap.md).
