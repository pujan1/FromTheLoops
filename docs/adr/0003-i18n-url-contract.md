---
status: accepted
date: 2026-06-01
deciders: [pujan]
---

# ADR-0003 — i18n URL contract: single locale, no prefix

## Context

Sprint 1 introduces next-intl so user-facing copy lives in message catalogs
instead of inline JSX (the submission flow is the first surface to demand
this). V1 ships English only, but we don't want to relitigate the i18n
foundation later when a second locale appears.

The open question is the **URL contract**: next-intl's headline feature is
locale-prefixed routing (`/en/submit`, `/fr/submit`) backed by a middleware
that negotiates locale and redirects. Adopting that now would change every
internal link, add a middleware that runs on every request, and interact with
the Clerk auth middleware we already run — all for a single locale that needs
no disambiguation. The Sprint 1 plan flags this risk explicitly
(§Risks: "next-intl introduces routing overhead we don't want yet").

## Decision

Run next-intl in **single-locale, no-prefix** mode. The locale is fixed to
`en` in `apps/web/i18n/request.ts`; there is **no** `[locale]` route segment
and **no** i18n middleware. URLs stay exactly as they are today
(`/submit`, `/drafts/[id]`, …) with no `/en` prefix. Messages live in
`apps/web/messages/en.json`; server components read them via
`getTranslations`, client components via `useTranslations`, both fed by a
single `NextIntlClientProvider` in the root layout.

## Alternatives considered

| Option | Why not |
|---|---|
| Locale-prefixed routing (`/[locale]/…`) + next-intl middleware | Real routing/redirect overhead and a second middleware to reconcile with Clerk's, for zero disambiguation value while we're English-only. Premature. |
| Domain/subdomain per locale (`fr.` …) | Infra + DNS + cookie-scope complexity with no V1 payoff. |
| Roll our own `t()` over a plain JSON map | Re-implements pluralization, rich-text, and type-safety next-intl already gives us; no upside. |

## Consequences

### Positive
- Zero URL churn and no extra per-request middleware now; the Clerk matcher
  stays the only middleware.
- Copy is already externalized and keys are namespaced, so adding a locale
  later is a catalog + locale-negotiation change, not a surface rewrite.

### Negative
- No language switching in V1. A future second locale is a deliberate
  follow-up: introduce locale negotiation (Accept-Language header or a
  cookie) in `i18n/request.ts`, and decide *then* whether to adopt prefixed
  routing — which would be a breaking URL change requiring redirects.

### Neutral / open
- `i18n/request.ts` is the single seam where locale selection plugs in; call
  sites (`getTranslations`/`useTranslations`) won't change when it does.
- The catalog is currently passed wholesale to the client provider. If it
  grows large we'll split per-namespace; not worth it at Sprint 1 size.

## References

- Sprint 1 plan — §Risks & mitigations ("default-locale-no-prefix mode;
  document the URL contract in ADR"), §In scope (next-intl wiring).
- next-intl docs — "Without i18n routing" setup.
- ADR-0001 (stack choice), ADR-0002 (ORM) for prior decisions in this series.
