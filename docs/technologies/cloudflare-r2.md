# Cloudflare R2

## Role In FromTheLoop

Cloudflare R2 is planned object storage for user uploads, exports, and report attachments. It is not integrated into app code yet.

## Where It Lives

- Setup runbook: `docs/runbooks/external-services.md`
- Planned env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`

## Workflow Integration

The planned bucket is:

```text
fromtheloop-uploads
```

Later sprint work should add a storage client and upload flow, likely from route handlers or server actions, while keeping direct secret access server-side.

## Tradeoffs And Gotchas

- R2 avoids S3 egress-style pricing pressure for alpha.
- It is not currently a source of truth for structured data; Postgres should store metadata and ownership.
- Public access strategy is undecided. A public URL or custom domain should be configured deliberately.
- API tokens should be scoped to the bucket and minimum object permissions needed.

## Common Workflow

1. Create the bucket in Cloudflare.
2. Store credentials in Vercel and any worker environment that needs object access.
3. Add upload metadata tables in Postgres before wiring user uploads.
4. Keep app writes server-side so secrets never reach the browser.
