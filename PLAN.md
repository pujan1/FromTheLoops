# Project Plan — FromTheLoop (Interview-Prep Wedge)

> Locked-in design decisions from the grilling session. Treat this as the source of truth for V1 build.

---

## Strategic foundation

| Decision | Locked |
|---|---|
| **Wedge** | Structured interview reports + taxonomy-aware search ("find the right interview for what you're interviewing for") |
| **Beachhead** | US tech engineering candidates (SWE, ML, data, SRE, frontend/backend/mobile, new-grad to senior) |
| **Expansion path** | US tech (V1) → India tech (V2) → adjacent roles (V3) |
| **Wedge philosophy** | Structured on 6 key fields (company, role, level, round-type, topic-tags, outcome); open everywhere else |

---

## V1 scope

**IN:**
- Interview report submission (structured per-round)
- Aggregated insights pages (Position Y) at `/companies/[company]/[role]/[level]`
- Report list (Position X) on same page
- Question-first browse (D) at `/topics/[topic]`
- Search bar with filters
- Company profile pages
- User profile pages
- Karma system
- Admin curation tooling (mod queues + audit log)
- Auth via Clerk (work-email-stub verification)

**OUT (defer to V2+):**
- Comp/salary data
- Employee reviews (Glassdoor-style "what's it like to work here")
- Job portal / listings
- Ashby-lite apply
- AI summaries / synthesis (no user-facing AI in V1)
- Employer paid profiles
- Interview tracker
- Spanish / i18n content (English-only V1; architecture i18n-ready)
- LinkedIn employment-history verification (requires paid Talent Solutions API)

---

## Data model

Current implementation reference: [docs/data-model.md](docs/data-model.md).
This section is the original product model sketch; use the data-model doc and
Drizzle schema for current fields, relationships, and derived models.

```text
interview_report {
  id, source ('seed_dummy' | 'seed_curated' | 'user_submitted' | 'imported'),
  created_by_user_id, created_at,
  company_id (required, FK to curated),
  canonical_role_id (required, FK to curated),
  level (required-with-NA, per-company enum),
  outcome (optional, enum: 'offer' | 'reject' | 'withdrew' | 'ghosted' | 'pending'),
  rounds[] (0..N),
  display_attribution ('display_name' | 'anonymous'),
  evidence_verified (bool),
  status ('active' | 'pending_moderation' | 'deleted'),
  trust_badge_displayed (computed)
}

round {
  round_type (required, enum: 'recruiter-screen' | 'technical-phone' | 'onsite-coding' |
              'onsite-system-design' | 'onsite-behavioral' | 'take-home' |
              'hiring-manager' | 'exec-final' | 'other'),
  questions[] (0..N),
  experience_prose (optional, free text),
  rating (required, enum: 'positive' | 'mixed' | 'negative')
}

question {
  question_prose (required, free text),
  topic_tags[] (required, ≥1 from curated tag set)
}

user_verification {
  user_id, company_id, verified_via ('work_email' | 'linkedin' | 'manual'),
  verified_at, evidence_token (hash)
}

mod_action_log {
  id, mod_user_id, action_type ('approve' | 'reject' | 'merge' | 'ban' | 'delete' | 'edit_taxonomy'),
  target_type, target_id, reason, metadata (jsonb), created_at
}
```

---

## Search & discovery

- **Page archetype**: `/companies/[company]/[role]/[level]`
  - Top: aggregated insights (Position Y — what Google indexes)
  - Below: individual report list (Position X — what readers click into)
  - Right rail: reserved space for V2 comp data ("coming soon" CTA in V1)
- **Sparse-data fallback**: broaden scope with banner + tag-level aggregation when <10 reports per cell
- **Programmatic SEO**: committed — ~1000s of canonical URLs; sitemap.xml + JSON-LD + Core Web Vitals discipline
- **Per-company level slugs** in URLs (`amazon/sde2`, `google/l4`, `meta/e4`)
- **Filters in query params**, never new canonical paths
- **No individual question pages** in V1 (thin-content risk); topic pages aggregate questions

### URL structure

| URL pattern | Purpose | SEO target |
|---|---|---|
| `/` | Home/landing | brand |
| `/companies` | All companies index | "tech interview questions companies" |
| `/companies/[company]` | Company overview | "stripe interview questions" |
| `/companies/[company]/[role]` | Company × role | "stripe backend interview" |
| `/companies/[company]/[role]/[level]` | **Canonical wedge page** | "stripe l4 backend interview questions" |
| `/reports/[report-id]` | Individual report detail | — |
| `/topics` | All topics index | "interview topics" |
| `/topics/[topic]` | Topic × all companies | "system design rate limiter interview questions" |
| `/topics/[topic]/[company]` | Topic × company | "stripe system design interview" |
| `/u/[username]` | User profile | — |
| `/search?q=...` | Search results | — (noindex) |
| `/submit` | Submission form | — |
| `/drafts/[draft-id]` | Resume draft | — |
| `/dashboard` | User dashboard | — |
| `/settings` | Account settings | — |
| `/admin/*` | Mod queues | — (role-gated) |
| `/about`, `/privacy`, `/terms`, `/faq`, `/legal/takedown` | Legal/standards | — |

---

## Architecture & stack

| Layer | Choice |
|---|---|
| Posture | Modular monolith with event-driven internals |
| Frontend | Next.js 15 App Router on Vercel (free tier) |
| Backend logic | Next.js route handlers + server actions |
| Background worker | Separate Node process running BullMQ |
| Database | Neon Postgres (free tier; branching for dev/staging) |
| Search | Typesense (self-hosted) |
| Aggregation strategy | Hybrid — Postgres materialized views for canonical aggregates + Typesense facets for dynamic filtering |
| Cache + queue | Redis (self-hosted) |
| Auth | Clerk (free tier) |
| Object storage | Cloudflare R2 (free tier) |
| Email | Resend (free tier) |
| Errors | Sentry (free tier) |
| Event bus (internal) | Postgres `events` table + LISTEN/NOTIFY |
| Hosting (worker + Typesense + Redis) | Hetzner CX22 ~€5/mo with Docker |
| Hosting (frontend/SSR) | Vercel free tier |
| **Total infra at alpha** | **~$5/mo** |

Async aggregation lag (seconds-to-minutes) is accepted as a trade-off for the hybrid strategy.

---

## Trust & verification

### 3-layer trust model

**Layer 1 — Person legitimacy** (automated): email signup + Clerk anti-abuse signals + captcha on first submission. Required for all users.

**Layer 2 — Professional legitimacy** (optional, user-driven):
- LinkedIn OAuth as **person-legit signal only** (free OAuth `r_liteprofile`), NOT employment-history verification
- OR work-email verification at any company they've worked at

**Layer 3 — Interview-specific evidence** (per-report, admin-reviewed):
- User uploads ONE of: recruiter email screenshot, calendar invite, rejection/offer email, take-home assignment header
- Admin reviews in queue (≤24h SLA at alpha)
- Approved → "Recruiter-Confirmed" badge **on that specific report**

### Trust badges (visible to readers)

| Tier | Layers | Notes |
|---|---|---|
| 🚫 Unverified | 1 only | submission allowed, lower karma earn |
| ✓ Verified professional | 1+2 | global to user |
| ✓✓ Recruiter-Confirmed | 1+3 (±2) | per-report; only this confirms the interview event |
| ✓✓✓ Verified Employee | 1+2 (work-email at company) | rare; current/former employee writing about own company |

### Aggregation weighting

Mix everything, weighted by trust tier: unverified 0.3, verified-pro 0.7, recruiter-confirmed 1.0, verified-employee 1.0.

### Anonymity is display-only

Account-bound karma + optional public attribution. Disclosed in ToS. Internal: `report.created_by_user_id` always populated; `display_attribution` toggle controls public visibility only.

---

## Karma

- **Account-bound**, optional anonymous display per-submission
- **Earn**: submission base (5 unverified / 10 verified-pro / 25 recruiter-confirmed) + helpfulness flags from readers
- **Effect**: vanity badges (10/100/1000 tiers) + helpful-flag-weighted aggregation ranking
- **No karma-affects-search-ranking-of-submitter** (rich-get-richer trap avoided)

---

## Submission flow

- **Single-page form** with collapsible per-round cards
- **Server-side draft persistence** (accepted scope: ~2 days)
- **Date** defaults to current month/year
- **24h edit window** after submission, then locked
- **Soft delete** with 90-day PII-purged audit window (not hard delete)
- **Submission confirmation email** only in V1 (other notifications V2)

---

## Taxonomy curation (D-hybrid for all three)

| Entity | Pattern |
|---|---|
| **Companies** | Fuzzy autocomplete; suggest existing or create-pending → mod-reviewed |
| **Roles** | Autocomplete-only + pending alias to canonical (NO inline create — wedge-critical) |
| **Tags** | Fuzzy autocomplete; allow create-pending; pending tags do NOT appear in aggregates until promoted |

Mod queue is your responsibility (solo, V1).

---

## Information architecture commitments

- All SEO pages SSR/SSG (no CSR-only)
- English-only V1; **i18n-ready architecture** (next-intl from day 1; `locale` column in schemas)
- V1 page layout reserves right-rail space for V2 comp data ("Salary range coming soon — submit yours" CTA)
- V2 comp layout: hybrid summary on role-level page + dedicated `/companies/[company]/[role]/[level]/comp` sub-page

---

## Moderation operations

### Strategy

- **A. Heuristic auto-approve** for low-risk pending entities (verified submitter + domain valid + dedup clean → auto)
- **D. Hard auto-rules**: slur/PII/contact-info regex blocks; copy-paste detection; rate limits
- **Manual review** for everything else (V1 trade-off — no LLM moderation in V1)
- **Rate limit**: 10 submissions/day per user from start

### Realistic load forecast (manual)

| Stage | Daily mod time |
|---|---|
| Alpha (~100 users) | 30–45 min/day |
| Early beta (~1K users) | 2–3 hours/day |
| 1K+ DAU | hire help / delegate |

### RBAC

- **Clerk metadata** role enum: `user | moderator | admin | super_admin`
- **DB `mod_action_log`** table for audit trail (every mod action logged)
- **Admin panel** UI: ~2 weeks build during V1; tabbed queue views; auth-gated `/admin/*` route

### Mod queues (7 total)

1. Pending companies
2. Pending tags
3. Pending role aliases
4. Recruiter-Confirmed evidence reviews
5. Community flags
6. Soft-delete audit reviews (90-day window)
7. New-user first-submission moderation hold

---

## Legal minimums (~3.5 days work)

| Item | Implementation |
|---|---|
| `/privacy` | Termly-generated + customized |
| `/terms` | Termly-generated + customized |
| `/legal/takedown` | Hand-written half-page + `legal@` email |
| Signup checkbox | Clerk config: "I agree to Terms and Privacy Policy" |
| Anonymity disclosure | Inline note next to "Post Anonymously" toggle on submission form |
| Settings → Export my data | API endpoint returns JSON dump |
| Settings → Delete my account | Soft-delete + PII purge |
| `legal@fromtheloop.com` (or final domain) | Cloudflare email routing (free) |

**Admin-content-edit rule**: admins can approve/reject/hide/delete reports but NEVER edit user content body (Section 230 hygiene).

**Lawyer review**: optional V1 alpha, recommended before V2 / paid users (~$500–1500 on Upwork or Atrium).

---

## Cold start

- **V1 supply**: solo dev seeds dummy + curated data (tagged `source = 'seed_dummy'`)
- **Alpha launch**: real users will submit; dummy data deletable by `WHERE source = 'seed_dummy'`

### Acquisition (revisit before launch)

| Channel | Role |
|---|---|
| Twitter build-in-public | Pre-launch audience (start now) |
| Show HN | Single tier-1 launch lever (don't burn until V1 polished) |
| Reddit r/cscareerquestions et al. | Content artifacts post-launch (build karma first) |
| Cold LinkedIn DMs | High-conversion early-user channel |
| Programmatic SEO | V2 compounding workhorse |
| Discord/Slack communities | Medium-term grind |
| Paid ads | OUT for V1 |
| Influencers | V2+ |

---

## Anti-abuse baseline (V1)

- Disposable email blocklist (`disposable-email-domains` package)
- Rate limits: 10 submissions/day/user; 1 submission/company/user without override
- IP fingerprinting + Clerk built-in abuse signals
- Honeypot field on submission form
- New-user submissions on 24h moderation hold (drops after 3 verified submissions)

---

## V2+ roadmap (directional, not committed)

| Order | Feature |
|---|---|
| V1 | Wedge (interview reports + search) |
| V2 | Compensation data (levels.fyi-depth) on the role-level page |
| V2 | Spanish locale |
| V2 | LLM-assisted moderation (internal tooling) |
| V2 | Community moderation (high-karma users get queue powers) |
| V2.5 | Employee reviews (Glassdoor-style) |
| V3 | Job portal + Ashby-lite apply |
| V3+ | Employer paid features (verified profiles, recruiter tools) |
| V3+ | AI summary / synthesis layer over reports |
| V3+ | Mobile apps |

---

## Suggested sprint breakdown (8 × 2-week sprints ≈ 16 weeks)

| Sprint | Focus |
|---|---|
| 0 | Project scaffolding, Next.js + Neon + Clerk + Typesense setup; Hetzner box provisioned; CI; seed data tooling |
| 1 | Submission flow (form, schema, taxonomy autocomplete, drafts) |
| 2 | Submission flow (rounds, questions, tags, validation, soft delete) |
| 3 | Aggregation pipeline + materialized views; Typesense indexing; sparse-data fallback |
| 4 | Aggregated insights page (Position Y) + report list (Position X); search bar + filters |
| 5 | Question-first browse (`/topics`); company/user profile pages; karma system |
| 6 | Admin panel + mod queues + RBAC + audit log |
| 7 | Legal pages, polish, SEO (sitemap, JSON-LD, performance budget), alpha-ready |

---

## Open items (not designed yet — execution-level)

- Monetization direction commitment (V2+ — defines architecture seams)
- Visual design direction (use `/frontend-design` skill once wireframes exist)
- Sprint-level estimation + risk tracking
