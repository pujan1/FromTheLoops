# Cloudflare

## Role In FromTheLoop

Cloudflare is the authoritative DNS provider for `pujan.tech`. It also supports Let's Encrypt DNS-01 challenges for the Redis TLS certificate. Email Routing and R2 object storage are planned.

## Where It Lives

- Architecture reference: `docs/architecture.md`
- External services runbook: `docs/runbooks/external-services.md`
- Certbot notes: `docs/runbooks/hetzner-bootstrap.md`
- Production Redis cert mount: `infra/hetzner/docker-compose.prod.yml`

## Workflow Integration

Cloudflare DNS resolves app and box hostnames. Certbot on the Hetzner box uses a scoped Cloudflare API token to complete DNS-01 challenges for `box.pujan.tech`; the renewal hook copies certs into the Redis TLS mount and restarts Redis.

Production Redis expects certs here:

```yaml
volumes:
  - /opt/fromtheloop/certs:/tls:ro
command:
  - --tls-cert-file
  - /tls/fullchain.pem
  - --tls-key-file
  - /tls/privkey.pem
```

## Tradeoffs And Gotchas

- DNS-only records keep the setup simple while Vercel and the Hetzner box terminate their own protocols.
- DNSSEC at the registrar can break resolution during nameserver cutover if an old DS record remains.
- Cloudflare API token should be scoped to DNS edit/read for the one zone only.
- R2 and Email Routing are planned but not yet wired into application code.

## Common Workflow

1. Manage DNS in Cloudflare, not at Squarespace.
2. Keep the certbot token permissions scoped.
3. When rotating certs, confirm Redis picked up the renewed files.
4. Before nameserver moves, disable stale registrar DNSSEC settings.
