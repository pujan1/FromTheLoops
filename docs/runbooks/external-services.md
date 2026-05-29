# Runbook — external service setup (Sentry, R2, Resend, Cloudflare email)

Sprint 0 Day 7 deliverables. The code wiring is done; the items below are
**dashboard/account steps that need your logins**. Each ends with the env
var(s) to paste into Vercel (web) / the Hetzner box `.env` (worker).

The SDKs no-op when their DSN/key is unset, so local dev and CI stay green
without any of this configured. Configure it for deployed environments.

---

## 1. Sentry — two projects (web + worker)

The code is wired:
- web: `apps/web/instrumentation.ts`, `instrumentation-client.ts`,
  `sentry.{server,edge}.config.ts`, `app/global-error.tsx`, and
  `withSentryConfig` in `next.config.ts`.
- worker: `apps/worker/src/sentry.ts`, imported first in `src/index.ts`;
  failed jobs call `Sentry.captureException`.

Steps:
1. Create a Sentry org (or use existing) at https://sentry.io.
2. New project → platform **Next.js** → name `fromtheloop-web`. Copy its DSN.
3. New project → platform **Node.js** → name `fromtheloop-worker`. Copy its DSN.
4. Create an org auth token (Settings → Auth Tokens) with `project:releases`
   scope for source-map upload.

Env to set:

| Var | Where | Value |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | web project DSN |
| `SENTRY_DSN` | Vercel | web project DSN (server runtime) |
| `SENTRY_DSN` | Hetzner box `.env` | **worker** project DSN |
| `SENTRY_ORG` | Vercel | org slug |
| `SENTRY_PROJECT` | Vercel | `fromtheloop-web` |
| `SENTRY_AUTH_TOKEN` | Vercel | auth token (build-time only) |
| `SENTRY_ENVIRONMENT` | both | `production` / `preview` |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Vercel | same |

**Verify (exit criterion — one test error from each app in Sentry):**
- web: deploy, then `curl https://<deployment>/api/debug-sentry` → 500; the
  error appears in `fromtheloop-web` within ~30s.
- worker: on the box, `pnpm --filter @fromtheloop/worker sentry:test` (or run
  the built `throw-test` script) → captures + flushes; appears in
  `fromtheloop-worker`.

---

## 2. Cloudflare R2 — `fromtheloop-uploads` bucket

Created now, **not integrated** until report-attachment work (later sprint).

1. Cloudflare dashboard → R2 → Create bucket → `fromtheloop-uploads`.
2. R2 → Manage API Tokens → create a token scoped to that bucket
   (Object Read & Write). Note Account ID, Access Key ID, Secret.
3. (Later) attach a public `r2.dev` URL or custom domain for read access.

Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET=fromtheloop-uploads`, `R2_PUBLIC_URL`.

---

## 3. Resend — transactional email

1. https://resend.com → create account.
2. Add + verify the sending domain (DNS records go in Cloudflare —
   SPF/DKIM TXT + the Resend MX). Note: this is the **sending** domain;
   `legal@` inbound routing is step 4.
3. Create an API key (sending scope).

Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (e.g. `no-reply@pujan.tech`).

---

## 4. Cloudflare Email Routing — `legal@`

DNS for `pujan.tech` is already on Cloudflare (Day 4/6 notes).

1. Cloudflare dashboard → `pujan.tech` → Email → Email Routing → enable.
   This adds the required MX + TXT records automatically.
2. Add a custom address `legal@pujan.tech` → forward to your real inbox;
   confirm the verification email.
3. (Optional) a catch-all rule to the same inbox.

No app env needed — this is inbound forwarding only. Note the interaction
with Resend's sending DNS in step 3: Email Routing's MX must coexist with
Resend's records; add them, don't replace.

---

## Status checklist (Day 7 exit criteria)

- [ ] Sentry org + 2 projects created, DSNs set in Vercel + box
- [ ] Test error from web visible in Sentry (`/api/debug-sentry`)
- [ ] Test error from worker visible in Sentry (`sentry:test`)
- [ ] R2 bucket `fromtheloop-uploads` created (integration deferred)
- [ ] Resend account + verified sending domain + API key
- [ ] Cloudflare Email Routing live for `legal@pujan.tech`
