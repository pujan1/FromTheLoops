# Sprint 4 — Wedge Page Wireframe (Day 1)

> The "on paper" wireframe for `/companies/[company]/[role]/[level]`, as text so
> it lives with the code and Days 2–8 can build against it. Grounded in the
> aggregate columns that **actually exist** (`aggregates_company_role_level`,
> verified against seed data Day 1): `report_count`, `outcome_offer/reject/
> withdrew/ghosted/pending`, `trust_weighted_count`, `median_round_count`,
> `mode_round_sequence text[]`, `top_topics jsonb`.

## Canonical URL

```
/companies/stripe/backend/l4
            └company  └role └level slug (per-company; "l4", "sde2", "e4")
```

## Layout — desktop (≥1024px), two-column

```
┌──────────────────────────────────────────────────────────────────────────┐
│  HEADER  [ FromTheLoop ]        [ 🔍 search companies, roles, topics… ]  ▸ │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│  Breadcrumb:  Companies › Stripe › Backend Engineer › L4                   │
│                                                                            │
│  Stripe · Backend Engineer · L4                          (H1, canonical)   │
│  18 interview reports · last updated 2d ago                                 │
│                                                                            │
│  ┌─ SPARSE BANNER (only when scope ≠ 'exact') ─────────────────────────┐  │
│  │ ⚠ Only 6 reports at this exact level. Showing Backend Engineer       │  │
│  │   across all Stripe levels. [show exact only]                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌────────────────────── POSITION Y (aggregates) ─────────┐ ┌─ RIGHT ───┐ │
│  │                                                          │ │  RAIL     │ │
│  │  OUTCOME DISTRIBUTION            report_count = 18       │ │           │ │
│  │  ▇▇▇▇▇▇▇ offer 4   ▇▇▇▇▇▇▇▇▇▇▇▇ reject 8                 │ │ 💰 Salary │ │
│  │  ▇▇▇ withdrew 2   ▇▇▇ ghosted 3   ▇ pending 1            │ │ range     │ │
│  │                                                          │ │ coming    │ │
│  │  TRUST-WEIGHTED  10.3 weighted signal (of 18)            │ │ soon —    │ │
│  │  (verified reports count more; see methodology)          │ │ submit    │ │
│  │                                                          │ │ yours     │ │
│  │  COMMON ROUND STRUCTURE        median 5 rounds           │ │ [ + Add ] │ │
│  │  ① recruiter-screen → ② technical-phone →                │ │           │ │
│  │  ③ onsite-coding → ④ onsite-system-design →              │ │ ─────────  │ │
│  │  ⑤ onsite-behavioral        (mode_round_sequence)        │ │ Related:  │ │
│  │                                                          │ │ · L3 (12) │ │
│  │  TOP TOPICS                    top_topics[≤10]           │ │ · L5 (4)  │ │
│  │  [system-design ×14] [caching ×9] [sql ×8]               │ │ · FE L4   │ │
│  │  [api-design ×7] [graphs ×6] [concurrency ×5] …          │ │           │ │
│  │  (chips link to /topics/[slug]; count = occurrences)     │ │           │ │
│  └──────────────────────────────────────────────────────────┘ └───────────┘ │
│                                                                            │
│  ─────────────────────── POSITION X (report list) ───────────────────────  │
│                                                                            │
│  FILTERS (chips, reflect ?round=&outcome=&tag=&trust=):                     │
│  Round: [all][recruiter-screen][onsite-coding][system-design]…             │
│  Outcome: [all][offer][reject][ghosted]   Trust: [all][verified]           │
│                                                                            │
│  ┌─ report card ───────────────────────────────────────────────────────┐  │
│  │ ✅ Offer · L4 · 2026-03 · 5 rounds          🛡 verified · anonymous   │  │
│  │ "Standard loop, system-design was the bar-raiser…"                    │  │
│  │ [system-design] [caching] [api-design]              → read full ▸     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  ┌─ report card ───────────────────────────────────────────────────────┐  │
│  │ ❌ Reject · L4 · 2026-01 · 4 rounds                  Priya N.         │  │
│  │ …                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  … (20 / page)                                                              │
│                                                                            │
│  ‹ Prev   1 2 3 … 4   Next ›        (page in ?page=; SSR)                   │
└──────────────────────────────────────────────────────────────────────────┘
```

## Layout — mobile (<768px), single column, stacked

```
HEADER (search collapses to 🔍 icon → full-screen overlay)
Breadcrumb (truncated: … › Backend › L4)
H1 + count
[Sparse banner if any]
POSITION Y card (full width; outcome bars → topics → rounds, in that order;
  trust signal inline under outcomes)
Right-rail CTA becomes an inline card BELOW Position Y, ABOVE the list
FILTER chips (horizontal scroll row)
Report cards (full width, 20/page)
Pagination
```

## Data → component map (drives Day 2–4)

| UI block | Source | Notes |
|---|---|---|
| H1 + count | `report_count`, resolved company/role/level names | canonical, SSR |
| Outcome bars | `outcome_offer/reject/withdrew/ghosted/pending` | bars sum to ≤ count (NULL outcomes excluded) |
| Trust signal | `trust_weighted_count` | "X weighted of N"; tooltip → methodology |
| Round structure | `median_round_count`, `mode_round_sequence` | sequence renders as numbered chips |
| Top topics | `top_topics` jsonb (`{slug,name,count,weighted_count}`) | chips → `/topics/[slug]` |
| Report cards | report rows for the cell (paginated) | outcome icon, level, month, round count, trust badge, attribution, ≤3 topic chips |
| Sparse banner | `decideScope()` → `{scope, count, broadened}` | only render when `scope !== 'exact'` |
| Right rail | static CTA + sibling-level links | salary = placeholder in V1 |

## States to design for

- **Exact** (`report_count ≥ 10`): full Position Y, no banner. (e.g. `stripe/backend/l4` = 18)
- **Sparse** (`< 10`, broadened to `role`): banner + aggregates over the broadened scope. (e.g. `meta/backend/e5` = 6)
- **Tag-floor** (no role data): banner says "across similar roles", topic-level aggregation. (rare in seed)
- **Empty**: should not happen for a canonical URL we render — unresolvable cell → 404, not an empty page.

## Open questions for Day 2 (routing)

- Level slug ↔ display name resolution: URL carries `l4`, DB stores display `L4` + a
  `company_levels.slug`. The canonical resolver (`packages/core/url/`, ADR for the
  URL contract) maps both directions. **NB:** the Sprint 4 plan calls this "ADR-0004"
  but `0004` is already taken (validation-and-soft-delete) — the URL-contract ADR
  needs a fresh number (likely `0005`), and the Sprint 3 aggregation ADR (never
  written) needs one too.
- ISR for the no-filter canonical URL; SSR (short cache) for filtered variants.
```
