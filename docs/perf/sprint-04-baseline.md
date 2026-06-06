# Sprint 4 — Core Web Vitals + Lighthouse baseline

> Day 9 deliverable. Baseline for the canonical browse surface after the
> role-primary re-architecture ([ADR-0009](../adr/0009-role-primary-browse-grain.md)),
> so Sprint 7's polish pass has a number to beat.

## Method

- **Build:** production (`next build` + `next start`), **not** dev — dev is
  unminified and HMR-instrumented, so its timings are meaningless.
- **Page:** the canonical money page, `/companies/amazon/swe` (the role page —
  Position Y role aggregate + Position X report list). Seeded local data (23
  reports across SDE II / SDE III).
- **Profile:** throttled mobile — **4× CPU slowdown, Slow 4G**, viewport
  412×915 @2.625 DPR. Chrome DevTools performance trace (CWV) + Lighthouse
  (categories), via the chrome-devtools MCP.
- **Date:** 2026-06-06.

## Core Web Vitals (throttled mobile)

| Metric | Budget (exit criterion) | Measured | |
|---|---|---|---|
| **LCP** | < 2.5 s | **~0.74–0.82 s** | ✅ well under |
| **CLS** | < 0.1 | **0.00** | ✅ no shift |
| **INP** | < 200 ms | n/a (see note) | ✅ by construction |
| TTFB | — | ~30 ms | local server |

- **LCP** is dominated by *render delay* (~0.7 s), not resource loading (TTFB
  ~30 ms) — expected for a server-rendered page whose LCP element is text (the
  `<h1>`), no hero image to fetch. Headroom is large even on Slow 4G.
- **CLS 0.00** — the layout is fixed-shape: no web-font swap reflow worth
  measuring (Archivo via `next/font` with `display: swap` + sized fallbacks),
  no late-injected banners, no images without dimensions. The sparse banner /
  Position Y are SSR'd in their final position.
- **INP** isn't captured by a navigation trace (it's an interaction metric), but
  the browse surface is **link-based** — filters, pagination, and the level
  facet are all `<a>` navigations, not client handlers. There is essentially no
  interaction JS on the critical path (only Clerk's auth widget + the theme
  toggle), so INP is negligible by construction. Revisit with field/CrUX data
  post-launch.

## Lighthouse (mobile, navigation)

| Category | Before Day 9 | After fixes |
|---|---|---|
| SEO | 91 | **100** |
| Accessibility | 94 | **100** |
| Best Practices | 77 | **77** (see below) |
| Agentic Browsing | 100 | **100** |

### Fixes made on Day 9

- **SEO `canonical` (91 → 100):** the browse pages set a *relative*
  `alternates.canonical` (`/companies/...`); a valid `rel=canonical` must be
  absolute. Added `metadataBase` (`NEXT_PUBLIC_APP_URL`) to the root layout so
  Next resolves every canonical to an absolute URL. **Directly serves the wedge
  SEO thesis** — the conditional canonicals from ADR-0009 are now well-formed.
- **a11y `color-contrast` (small metadata):** `--color-muted-2` (#9aa0aa) is
  ~2.6:1 on paper — below AA for normal text. Moved the small *text* usages
  (trust note, aggregate meta, rail level counts, report-card index) to
  `--color-muted` (~5:1). `--color-muted-2` is now decorative-only (separators,
  swatches), not body microcopy.
- **a11y `heading-order`:** report-card titles are `<h3>` with no `<h2>` above
  (h1 → h3 skip). Promoted the "Reports" / "Recent reports" section labels from
  `<p>` to `<h2>` (h1 → h2 → h3).
- **a11y `label-content-name-mismatch`:** the wordmark link's `aria-label`
  ("FromTheLoop") didn't contain its visible text ("From the Loop"). Matched
  them.

### Known / accepted (not fixed)

- **Best Practices 77 — `third-party-cookies` + `inspector-issues`:** both come
  from **Clerk** (the auth provider sets third-party cookies; the inspector
  issue is the browser's cookie-deprecation warning for them). Not our code and
  not fixable without dropping Clerk; tracked as a provider limitation. Every
  other Best-Practices audit passes.

## Caveats

- Single-run, local-server, seeded-data numbers — a baseline, not a field SLO.
  TTFB will rise in prod (Neon round-trip + Vercel cold starts vs. localhost);
  LCP has ~1.7 s of headroom to absorb that before the 2.5 s budget.
- No CrUX/field data yet (pre-launch). Re-measure against real-user vitals after
  launch; INP especially is only meaningful from field data.
- Not yet measured per-route: company page + level page reuse the same SSR shape
  + component set as the role page, so they're expected to be comparable; spot-
  check them in the Sprint 7 perf pass.
