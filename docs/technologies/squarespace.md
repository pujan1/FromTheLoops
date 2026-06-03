# Squarespace

## Role In FromTheLoop

Squarespace is only the registrar for `pujan.tech`. DNS is managed in Cloudflare, not Squarespace.

## Where It Lives

- Architecture notes: `docs/architecture.md`
- DNS runbook context: `docs/runbooks/hetzner-bootstrap.md`

## Workflow Integration

Squarespace holds the domain registration and renewal billing. Nameservers point to Cloudflare, where records for the app, portfolio, box, and email routing are managed.

## Tradeoffs And Gotchas

- Keeping registrar and DNS separate is normal, but it creates one easy-to-miss setting: DNSSEC.
- Before changing nameservers, disable stale DNSSEC/DS records at the registrar. A mismatched DS record can cause validating resolvers to return SERVFAIL.
- Day-to-day DNS changes should happen in Cloudflare only.

## Common Workflow

1. Use Squarespace for registration and renewal.
2. Use Cloudflare for DNS records.
3. Check registrar DNSSEC settings before nameserver changes.
4. Avoid adding app records in Squarespace while Cloudflare is authoritative.
