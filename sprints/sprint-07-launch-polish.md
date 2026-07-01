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
- [ ] Clerk legal-consent toggle enabled (Configure → Legal → *Require express consent*), Terms URL `/terms` + Privacy URL `/privacy` set; verify signup fails without the box ticked
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

### Day 1 — Privacy + Terms scaffold (2026-06-29)

Built the legal-doc surface and first-draft Privacy + Terms. Termly account
setup / generation is the user's manual step (external SaaS) and is *not* done;
these pages are drafts to paste Termly output over.

- **Hosting decision: static in-repo, not Termly's embed script.** This sprint's
  exit criteria weigh SEO + Core Web Vitals heavily; the embed is client-side
  JS, not server-rendered for Google, and unstyleable. So legal copy lives as
  TSX and is server-rendered. Cost: re-paste when regenerating in Termly —
  acceptable for docs that change rarely.
- **`apps/web/app/(legal)/`** route group. Shared `_components/legal-doc.tsx`
  (`LegalDoc` + `LegalSection`) renders site header, prose column, title +
  `<time>` last-updated, a TOC derived from the same section list (can't drift),
  and a **draft banner** gated by `draft` prop — flip to `false` after Termly
  paste + the calm-headed review. Stable section anchors so Day-2 `/legal/takedown`
  can deep-link the Terms DMCA section (`#dmca`).
- **`/privacy`** — 13 sections. Generic blocks marked `TODO(termly)`. §8
  *Anonymity and de-anonymisation risk* is hand-written and product-specific
  (content can identify you despite name removal; we retain de-identified
  experiences post-account-deletion) — must survive any paste-over.
- **`/terms`** — 16 sections. §4 *Content you submit* (UGC licence + user
  warranties: truthful / no-NDA-breach / no-confidential-materials / no naming
  individuals; no-verification + host-not-author posture) and §7 *Copyright and
  takedowns (DMCA)* (notice → counter-notice → repeat-infringer, `legal@`
  routing) are the load-bearing hand-written sections; Termly doesn't generate
  these adequately for a real-interview UGC host. Marked clearly in-file not to
  overwrite.
- Added `privacy` / `terms` / `takedown` to `lib/routes.ts` for Day-2 footer
  linking. Contact addresses use `@fromtheloop.com` placeholder — reconcile with
  the verified Cloudflare routing on Day 2. `tsc --noEmit` clean.

**Not done (carries):** Termly account + actual generated copy (user, manual);
footer links + Clerk ToS checkbox + email routing verification are Day 2;
removing the draft banner waits on final copy + review.

### Day 2 — Takedown page, footer, ToS consent (2026-06-30)

Built the non-copyright removal surface, wired the footer site-wide, and pinned
down what the Terms/Privacy signup consent actually requires.

- **`/legal/takedown`** — hand-written, reuses the `LegalDoc`/`LegalSection`
  chrome (draft banner on, same as privacy/terms). Six sections: overview →
  grounds → how to send → what happens next → limits/good-faith → contact.
  Covers the removals we actually expect on a real-interview host —
  confidentiality/NDA, **de-anonymisation & personal safety** (triaged ahead of
  queue), personal data / data-subject requests, and factual disputes — and
  routes **copyright to Terms §7** via the stable `#dmca` anchor. `legal@`
  routing kept intact. Load-bearing + product-specific: do not paste Termly over
  it.
- **Route-group gotcha.** `(legal)` is a *group* (invisible in the URL), so a
  page directly under it serves at `/privacy`, not `/legal/privacy`. `routes.
  takedown` and the Terms deep-link both point at `/legal/takedown`, so the file
  lives at `app/(legal)/legal/takedown/page.tsx` — the real `legal/` segment
  supplies the prefix while staying in the group.
- **`FtlSiteFooter`** (`components/ui/site-footer.tsx`) — server-rendered
  (Link + routes + CSS only, no client hooks) so the legal links are in the
  crawlable HTML, satisfying the "linked from footer" exit criterion. Three
  columns (Explore / FromTheLoop / Legal) + brand + a copyright/host-not-author
  disclaimer bar. Mounted once in the **root layout** through a thin client
  `SiteFooterGate` that hides it on `/admin/*` and the centered Clerk auth pages
  (those are deliberately chrome-free — admin uses its own `AdminNav`, no
  `FtlSiteHeader` either). `usePathname` runs during SSR, so public routes still
  ship the footer server-side. One mount point → no public page can miss it.
- **`/faq`** added (route + `PlaceholderPage`, mirrors `/about`) so all five
  footer legal/info links resolve now; the real FAQ copy is Day 3.
- **Clerk ToS checkbox is dashboard config, not code.** The required "I agree to
  Terms and Privacy" checkbox on the prebuilt `<SignUp />` comes from Clerk
  Dashboard → Configure → Legal → *Require express consent to legal documents*
  (set Terms URL `/terms`, Privacy URL `/privacy`). Enabling it makes signup fail
  until ticked — the exit criterion. Documented in the sign-up page and added to
  the manual cold-start checklist below. `tsc --noEmit` + eslint clean.

**Not done (carries):** enabling the Clerk legal-consent toggle (user, manual —
dashboard); **email-routing verification** for `legal@` / `support@` is still a
manual Cloudflare step and the `@fromtheloop.com` addresses stay as the assumed
production domain until that routing is confirmed; empty-state copy + real
`/about` + `/faq` content are Day 3.

### Day 4 — Sitemap, robots, canonicals, OG/Twitter (2026-06-30)

SEO infrastructure. Built and verified against the live dev DB — `/sitemap.xml`
returns **135 URLs** (exit criterion: >100), `/robots.txt` renders, and the OG
image is a real 1200×630 PNG.

- **Sitemap is canonical-only by construction.** New DB module
  `packages/db/src/reports/sitemap.ts` (`getSitemapEntries`) does five flat reads
  — companies, roles, dense levels, topics, dense topic×companies — no N+1 walk.
  The key correctness rule: a leaf page (level, topic×company) is only listed
  when its cell clears the density threshold (`>= 10`, mirroring core's
  `SPARSE_REPORT_THRESHOLD` / `decideLevelView` / `decideTopicCompanyView`).
  Thin leaves canonicalize *up* (to the role, resp. topic page), so listing them
  would advertise a duplicate; the `HAVING COUNT >= 10` drops them. Aggregate
  pages (company/role/topic) are always self-canonical → listed with ≥1 report.
  `<lastmod>` is `MAX(created_at)` of the reports feeding each page. Note: the db
  package doesn't depend on core, so the threshold is a local literal with a
  "keep in sync" comment.
- **Route-shape counts (seed data):** 9 static + 12 companies + 16 roles + 7
  dense levels + 43 topics + 50 dense topic×companies = 135. `app/sitemap.ts`
  (ISR, `revalidate = 3600`) maps them through `lib/routes.ts` so URL shapes stay
  single-sourced; absolute URLs via new `lib/site.ts` (`siteOrigin` /
  `absoluteUrl`, reads `NEXT_PUBLIC_APP_URL`).
- **Report detail pages deliberately NOT in the sitemap yet** — `/reports/[id]`
  has no `generateMetadata` (no self-canonical / title), so it'd be a weak entry.
  It gets metadata + JSON-LD on Day 5; fold it into the sitemap then.
- **`app/robots.ts`** — allow `/`, disallow `/admin`, `/dashboard`, `/settings`,
  `/drafts`, `/search`, `/api`; advertises the sitemap + host.
- **OG / Twitter.** Site-wide `openGraph` + `twitter` (summary_large_image)
  defaults in the root layout; a dynamic `app/opengraph-image.tsx` (next/og,
  1200×630, system fonts / flat fills so no asset loading) with
  `app/twitter-image.tsx` re-exporting it so the two never drift. Verified the
  head carries canonical + the full `og:*` / `twitter:*` set incl. the image.
- **Self-canonicals** added to `/` (home had none — inherited layout title, now
  pins `canonical: /`) and `/companies`; `/topics`, `/reports`, and the legal
  pages already had them, and the browse pages self/up-canonicalize via the
  density decisions. `tsc` (web + db) + eslint clean.

**Not done (carries):** `/reports/[id]` metadata + JSON-LD structured data
(`QAPage`/`Question`, `Organization`, `BreadcrumbList`) + Google Rich Results
test are Day 5; `noindex` on filter-mutated `/search` URLs — `/search` is
robots-disallowed, but add the meta `noindex` on the page too on Day 5. Core Web
Vitals re-check is its own line later in the sprint.
