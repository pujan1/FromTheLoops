import { getRequestConfig } from "next-intl/server";

// next-intl request config (Sprint 1 Day 7). Single locale, no URL prefix
// and no i18n middleware — see ADR-0003. `locale` is fixed to "en" for V1;
// this function is the seam where an Accept-Language header or a locale
// cookie would later choose the locale without changing call sites.
export default getRequestConfig(async () => {
  const locale = "en";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
