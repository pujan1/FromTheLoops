---
status: accepted
date: 2026-06-09
accepted: 2026-06-13
deciders: [pujan]
---

# ADR-0010 — Report triage: client master-detail pane over preserved per-report URLs

## Context

The browse surfaces — `/companies/:company/:role`, `/topics/:topic/:company`,
`/companies/:company` — render a paginated list of interview reports. The job a
visitor actually does there is **triage**: scan many reports, peek cheaply at
each, commit to the few that match their situation (same level, same outcome,
mentions the topic they're weak on). Today that costs a full round-trip per
peek: click row → SSR-load `/reports/:id` → read → browser-back → re-find place →
click next. The back-and-forth is the friction, and it scales linearly with how
hard someone is prepping.

Hard constraint going in: the browse stack is deliberately **SSR-first,
zero-client-JS, crawlable**. Filters are `<a>` links, every filter/page state is
a real URL (ADR-0006), and **every `/reports/:id` is its own indexable, shareable
SSR page** (full rounds→questions→topics tree, helpful-flag, owner controls).
Whatever we build must not cannibalize that. No market analysis or analytics
exist yet, so device split (desktop vs mobile) and triage-vs-consume-all are
unmeasured — we are deciding on intuition and must instrument to learn.

## Decision

**Add a client-driven master-detail "preview pane" as a layer *on top of* the
existing list, holding the ordered set of report IDs in memory and
shallow-updating the URL to the real `/reports/:id` as the selection changes. The
per-report SSR page is preserved unchanged as the canonical address, the
hard-nav fallback, and the crawler/no-JS target.**

Shape:

| Surface | Behavior |
|---|---|
| Desktop (≥1024px) | List left, detail pane right. Click/peek renders detail in the pane; list stays anchored (no context loss). |
| Mobile (<1024px) | **Bottom sheet** over the list: tap → sheet slides up (~80%), swipe-down dismisses back to the list. Horizontal swipe = secondary prev/next affordance. |
| Hard nav / crawler / no-JS | The real `/reports/:id` SSR page, exactly as today. |

Mechanics:

- **Pane content = full report, trimmed chrome.** The pane shows the *same*
  content as the page (single source of truth) — **not** a second "preview"
  representation, because for interview prep the rounds/questions content *is*
  the triage signal. The keystone refactor is extracting a presentational
  `<ReportDetailBody>` (takes serialized `detail`) used by **both** the SSR page
  and the client pane. The pane drops owner edit/delete (deliberate acts → route
  to the full page), keeps the helpful-flag, and adds a prominent "Open full
  report ↗".
- **Detail fetch + cache.** Pane fetches via a thin `GET /api/reports/:id` Route
  Handler returning serialized detail. Client holds a `Map<id, detail>` so
  re-peek and back-nav are instant. The near-immutable body is server-cached
  (busted by the existing edit/delete actions); the one volatile field (helpful
  count) is fetched separately / uncached. **Prefetch-one-ahead** on select;
  desktop hover-prefetch debounced (~100–150ms intent dwell) so a mouse sweep
  doesn't fire 20 fetches.
- **Ordering = full filtered ID list, capped.** Ship IDs only for the active
  filter (KB-scale; capped ~1–2k with a page-bounded fallback for pathological
  filters). The pane walks the **whole** result set, not just the visible page —
  paginated rows stay underneath with their real `?page=` URLs, and the list
  auto-advances when selection crosses a page boundary so the highlighted row
  stays visible. The ID source is a **pluggable ordered-ID provider** (warm
  entry = current-filter query; cold entry = a future synthesized recommendation
  sequence).
- **URL / history.** push-on-open, **replace-on-step**, esc-closes. The URL
  always reflects the open report (shareable, refresh-safe) without poisoning the
  back button — back exits to the list, it does not walk the N-deep peek chain.
  The bare list URL shows an **empty placeholder** (no auto-select), keeping it
  honest as the canonical list address.
- **Filters stay SSR links.** A filter change is a full navigation that re-ships
  the ordering and resets the pane — a new filter is a new triage context.
- **Instrument it.** Fire peek-open / prev-next-step / open-full / dwell events —
  the only path to the device-split and triage-vs-consume-all data we don't have.

## Alternatives considered

| Option | Why not |
|---|---|
| Collapse per-report URLs into the list (pane *replaces* the detail route) | Throws away the indexable, shareable per-report surface the whole SSR/crawlable thesis (ADR-0006) is built on. |
| Next.js intercepting + parallel routes drive the pane | Elegant for "open a modal, close it," but each detail is its own route render with no in-memory handle on its neighbors — prev/next, keyboard, and prefetch-one-ahead all become awkward. We need the ordered array client-side. |
| Trimmed "preview" representation in the pane | A second render of a report that drifts from the page; and the rounds/questions content it would trim *is* the triage signal. |
| Build a second JSON shape per peek instead of sharing the render | Forks the detail JSX; `<ReportDetailBody>` keeps one representation. |
| Full-screen mobile swipe-stack as the primary mobile UX | A consume-all interaction (always next *sequential*), not triage — it hides the list-level signal that makes triage fast. Demoted to a secondary swipe affordance on the bottom sheet. |
| Pane ordering = current page only | "Next" dies at the page edge — reintroduces a smaller version of the friction we're removing. |
| Rip out offset pagination → infinite scroll + cursor | Bigger rewrite that re-opens the back-button/footer/SEO questions `?page=` already solved. Capped full-ID-list gives seamless flip-through without it. |
| Client-ify the filter bar too | Reimplements the crawlable link-based facet model as client state for marginal smoothness; re-opens crawlability we've solved. |
| Keyboard nav (j/k) in v1 | Deferred to fast-follow — high value but the engine (`next/prev/select`) is the hard part and ships first; bindings are a thin later layer. |

## Consequences

### Positive
- Triage peek cost drops to ~one click + (usually prefetched) instant render; no
  round-trip, no lost place.
- Per-report URLs, crawlability, and the SSR/no-JS fallback (ADR-0006) are fully
  preserved — the pane is strictly additive.
- One detail representation (`<ReportDetailBody>`), shared by page and pane; the
  refactor also tidies the detail page.
- The ordered-ID provider seam is reused by the future cold-entry mobile-swipe
  feature.

### Negative
- The browse list surface gives up its zero-JS purity and becomes
  client-hydrated (confined to this surface; the SSR fallback page still exists).
- New server cache for detail bodies that must be invalidated in lockstep with
  edit/delete — a correctness coupling to watch.
- Two peek UIs (desktop pane + mobile sheet) over one engine = more surface to
  build and test than a single layout.

### Neutral / open
- **Cold-entry ordering** (direct Google→`/reports/:id` on mobile has no list):
  the provider seam exists, but the synthesized fallback sequence (same
  company+role → broaden) is deferred.
- **Keyboard bindings** deferred (roving tabindex, visible focus, esc-always-
  escapes, don't hijack keys in text inputs when built).
- Desktop-vs-mobile split and whether the pane earns its complexity are
  **bets**, resolved only once instrumentation lands.
- Blue-collar/non-tech expansion will need a different *detail content model*
  (rounds→questions→topics is tech-interview-shaped); this ADR's browse pattern
  is content-model-agnostic and unaffected.

## References

- [ADR-0006](0006-browse-url-contract.md) — canonical browse URL contract this builds on (and must not cannibalize).
- [ADR-0009](0009-role-primary-browse-grain.md) — the role page (`RoleView`) this pane layers onto.
- `apps/web/app/reports/[id]/page.tsx` — the SSR detail page; source of `<ReportDetailBody>`.
- `apps/web/components/reports/report-list.tsx` — the list that becomes the client-hydrated master.
- `apps/web/components/reports/filter-bar.tsx` — SSR filter links (unchanged).
