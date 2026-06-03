# Certbot

## Role In FromTheLoop

Certbot issues and renews the Let's Encrypt certificate for `box.pujan.tech`. Redis uses that certificate for the external TLS endpoint that Vercel connects to with `rediss://`.

## Where It Lives

- Architecture notes: `docs/architecture.md`
- Bootstrap/runbook notes: `docs/runbooks/hetzner-bootstrap.md`
- Redis TLS mount: `infra/hetzner/docker-compose.prod.yml`
- Cloudflare API token path on the box: `/etc/letsencrypt/secrets/cloudflare.ini`

## Workflow Integration

Certbot uses the Cloudflare DNS plugin for DNS-01 challenges, so the box does not need to expose port 80. Renewed certs are copied into `/opt/fromtheloop/certs`, which is mounted read-only into Redis:

```yaml
redis:
  volumes:
    - /opt/fromtheloop/certs:/tls:ro
  command:
    - --tls-cert-file
    - /tls/fullchain.pem
    - --tls-key-file
    - /tls/privkey.pem
```

## Tradeoffs And Gotchas

- DNS-01 keeps Redis TLS independent from HTTP hosting.
- The Cloudflare token should be narrowly scoped to the `pujan.tech` zone.
- Redis needs to restart or reload after renewed files are copied into place.
- Cert files inside the Redis container need ownership/permissions compatible with the Redis user.

## Common Workflow

1. Keep `box.pujan.tech` pointed at the Hetzner box.
2. Let `certbot.timer` renew automatically.
3. Confirm the deploy hook copies certs into `/opt/fromtheloop/certs`.
4. Verify Redis accepts external TLS connections after renewal.
