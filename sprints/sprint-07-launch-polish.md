# Sprint 7 — Legal, SEO, Polish, Alpha-Ready

> **Weeks 15–16**

## Goal

Take everything from green-light-works-on-localhost to actually-open-to-real-users. Legal pages, SEO infrastructure, performance budget, smoke-tested cold-start, and the operational runbook to handle the first 100 users.

## Why now

Sprints 0–6 build the product. Sprint 7 makes it shippable. Without this sprint, the alpha would either expose us legally, fail to index on Google, or break under the first wave of traffic.

## In scope

### Legal (~3.5 days of work — see PLAN.md)
- `/privacy` — Termly-generated + customized for this product
- `/terms` — Termly-generated + customized
- `/legal/takedown` — hand-written half-page + `legal@` Cloudflare routing verified
- Signup checkbox via Clerk config: "I agree to Terms and Privacy"
- Anonymity disclosure inline on submission form (verify Sprint 5's copy is present)
- Settings → Export my data verified end-to-end
- Settings → Delete my account verified end-to-end
- `/about`, `/faq` simple pages

### SEO
- `sitemap.xml` — dynamic, includes all canonical company × role × level URLs + topic pages
- `robots.txt` — allows everything indexable; disallows `/search`, `/admin`, `/dashboard`, `/settings`, `/drafts`
- JSON-LD structured data on canonical pages (`QAPage` / `Question`, `Organization`, `BreadcrumbList`)
- Canonical link tags on all pages; `noindex` on filter-mutated URLs
- Open Graph + Twitter card metadata
- Core Web Vitals re-checked: LCP <2.5s, INP <200ms, CLS <0.1 on the wedge page mobile

### Polish
- Empty-state copy across all surfaces (no "TODO" or lorem)
- Error pages (`not-found.tsx`, `error.tsx`, 500)
- Loading states (Suspense boundaries) on data-heavy pages
- Accessibility pass: keyboard navigation, focus rings, aria-labels on icon buttons, color contrast (axe DevTools clean on top 5 pages)
- Mobile pass: real iPhone test of the submission flow and the wedge page

### Ops
- Sentry alerts wired to email (error rate spike, queue depth, worker dead)
- Daily backup of Neon to R2 via worker cron
- "Day 1" runbook: what to monitor, what to fix first, how to roll back
- Cold-start launch checklist (see below)

## Out of scope

- Marketing / launch posts (separate, post-sprint)
- Paid ads infra (V2)
- A11y certification (beyond axe-clean and manual keyboard pass)
- Mobile app (V3)

## Deliverables

| Artifact | Where |
|---|---|
| `/privacy`, `/terms`, `/legal/takedown`, `/about`, `/faq` | `apps/web/app/(legal)/` |
| `sitemap.xml` route, `robots.txt`, JSON-LD components | `apps/web/app/` |
| `not-found.tsx`, `error.tsx`, 500 page | `apps/web/app/` |
| Accessibility audit results | `docs/perf/sprint-07-a11y.md` |
| Sentry alert rules exported / documented | `docs/runbooks/alerts.md` |
| Neon backup-to-R2 worker job | `apps/worker/jobs/backup.ts` |
| Day-1 runbook | `docs/runbooks/day-1.md` |
| Launch checklist (below) all green | this file's exit criteria |

## Cold-start launch checklist

- [ ] `.env` on Vercel + Hetzner audited; no dev secrets in prod
- [ ] DNS for production domain pointed; HTTPS valid
- [ ] Clerk production keys swapped in
- [ ] Resend production sender verified (SPF, DKIM, DMARC)
- [ ] Cloudflare email routing for `legal@`, `support@` verified by sending a test
- [ ] `seed_dummy` deletion script tested (won't be run pre-alpha; will run once real submissions reach a quota)
- [ ] Backup restore drill: blow away dev DB, restore from R2 backup, confirm
- [ ] Sentry quota understood; alert email going to a monitored inbox
- [ ] Status page or at minimum a "we're down, sorry" static HTML hosted on Vercel
- [ ] Termly legal docs reviewed once by you with calm head; obvious gaps closed
- [ ] Read PLAN.md once more end-to-end; flag anything that drifted

## Exit criteria

- [ ] All five legal pages live and linked from footer
- [ ] Submitting a signup without checking the ToS box fails with a clear message
- [ ] `sitemap.xml` includes >100 canonical URLs (seed data should make this trivial)
- [ ] Google Rich Results test passes on a sample wedge page and a sample topic page
- [ ] Core Web Vitals budgets met on three sampled pages, throttled mobile profile
- [ ] axe DevTools reports zero serious/critical issues on home, wedge, submit, profile, admin
- [ ] Mobile submission flow completable on a real phone in <5 minutes
- [ ] Sentry receives a test alert and the alert email lands within 2 minutes
- [ ] Backup cron has run successfully ≥2 nights in a row
- [ ] Cold-start launch checklist above all ticked
- [ ] Day-1 runbook walked through start-to-finish

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Termly-generated docs miss something this product needs (e.g., user-content / DMCA specifics) | Hand-customize the "user-generated content" + "DMCA" sections; budget half a day for this. Optional lawyer pass before V2 — flagged in PLAN.md. |
| Programmatic SEO pages get hit with "thin content" by Google | Sparse-data fallback (from Sprint 3) prevents truly empty pages; sitemap excludes cells with <3 reports until they fill in. |
| A11y issues take longer than expected | Time-box to 1.5 days; ship at axe-clean; defer keyboard polish edge cases to a post-alpha follow-up. |

## Dependencies

- Sprint 6 exit criteria — admin tooling exists, otherwise launching is irresponsible
- Termly account, payment method for Termly's small fee

## Day-by-day skeleton

| Day | Focus |
|---|---|
| 1 | Termly setup, generate Privacy + Terms, customize for UGC + DMCA |
| 2 | `/legal/takedown` + footer linking + Clerk ToS checkbox + verify email routing |
| 3 | `/about`, `/faq` + empty-state copy pass site-wide |
| 4 | `sitemap.xml`, `robots.txt`, canonical tags, OG metadata |
| 5 | JSON-LD on wedge + topic + report pages; Google Rich Results test |
| 6 | Error/404/loading states; mobile pass on real device |
| 7 | A11y audit; remediate top issues |
| 8 | Sentry alert rules, backup cron, restore drill |
| 9 | Day-1 runbook; cold-start checklist walk; smoke test prod-like deploy |
| 10 | Buffer; final exit-criteria sign-off; celebrate quietly |

## Notes & decisions

_Append-only._
