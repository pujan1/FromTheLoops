# ufw And fail2ban

## Role In FromTheLoop

ufw provides the host firewall on the Hetzner box. fail2ban adds SSH brute-force protection. Together they keep the self-hosted worker/search/Redis machine minimally exposed.

## Where It Lives

- First-boot setup: `infra/hetzner/cloud-init.yaml`
- Architecture notes: `docs/architecture.md`
- Bootstrap runbook: `docs/runbooks/hetzner-bootstrap.md`

## Workflow Integration

cloud-init installs and enables both tools:

```yaml
packages:
  - ufw
  - fail2ban

runcmd:
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
```

Production also opens Redis TLS on 6380 when external access is configured.

## Tradeoffs And Gotchas

- Default-deny limits blast radius if a service binds to the host by accident.
- Vercel does not provide a stable small outbound IP allowlist, so Redis access is protected by TLS and password rather than source IP alone.
- Keep Typesense internal-only unless a deliberate exposure plan is written.
- SSH password auth is disabled; make sure the registered SSH key is correct before reprovisioning.

## Common Workflow

1. Keep only required ports open.
2. Use Docker network exposure for internal services.
3. Verify firewall state after bootstrap with `ufw status`.
4. Check fail2ban status if SSH login attempts look suspicious.
