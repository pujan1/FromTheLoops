# next-intl

## Role In FromTheLoop

next-intl stores user-facing copy in message catalogs while keeping V1 URLs unprefixed. FromTheLoop is English-only for now, but the call sites are already shaped for future localization.

## Where It Lives

- Request config: `apps/web/i18n/request.ts`
- Messages: `apps/web/messages/en.json`
- Root provider: `apps/web/app/layout.tsx`
- Decision record: `docs/adr/0003-i18n-url-contract.md`

## Workflow Integration

The app uses single-locale, no-prefix mode. There is no `[locale]` route segment and no i18n middleware, so Clerk remains the only middleware layer.

```ts
// apps/web/i18n/request.ts
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  const locale = "en";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

The root layout resolves the locale and streams messages to client components:

```tsx
// apps/web/app/layout.tsx
const locale = await getLocale();

return (
  <html lang={locale}>
    <body>
      <ClerkProvider>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </ClerkProvider>
    </body>
  </html>
);
```

## Tradeoffs And Gotchas

- No `/en` prefix means no URL churn in V1.
- Adding a second locale later requires an explicit routing decision and redirects if prefixed routes are introduced.
- The full message catalog is currently sent through `NextIntlClientProvider`; split namespaces later if the catalog grows large.
- Do not add next-intl middleware until the URL contract changes.

## Common Workflow

1. Add copy keys to `apps/web/messages/en.json`.
2. Use server helpers in server components and `useTranslations` in client components.
3. Keep keys namespaced by feature.
4. If locale behavior changes, update ADR-0003 or write a superseding ADR.
