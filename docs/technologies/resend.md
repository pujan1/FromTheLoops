# Resend

## Role In FromTheLoop

Resend is the planned transactional email provider. It will send product emails such as verification, notifications, moderation updates, or user-facing transactional messages.

## Where It Lives

- Setup runbook: `docs/runbooks/external-services.md`
- Planned env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Planned worker queues: notification/email jobs through BullMQ

## Workflow Integration

Resend is not wired into code yet. The intended path is:

1. Web action or route records an event in Postgres.
2. Web or worker enqueues a BullMQ notification job.
3. Worker sends the email through Resend.
4. Worker records delivery state or failure details if product logic needs it.

## Tradeoffs And Gotchas

- Keeping email sends in the worker avoids holding Vercel requests open.
- Sending-domain DNS records live in Cloudflare and must coexist with Cloudflare Email Routing.
- Do not expose the API key to the browser.
- Email content should use product state from Postgres, not ad hoc request payloads.

## Common Workflow

1. Verify the sending domain in Resend.
2. Add required SPF/DKIM DNS records in Cloudflare.
3. Store `RESEND_API_KEY` in the worker environment.
4. Send emails from worker jobs, with Sentry capture around failures.
