// Sentry server-runtime init. Loaded by instrumentation.ts when
// NEXT_RUNTIME === "nodejs". No-ops cleanly when SENTRY_DSN is unset, so
// local dev and CI never need a real DSN.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // PII is sensitive on this product (interview reports). Keep it off.
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
