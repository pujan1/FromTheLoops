// Worker-side Sentry init. Import this module for its side effect *before*
// anything else in the process so the SDK's global handlers register early.
// No-ops cleanly when SENTRY_DSN is unset (local dev / CI).
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

export { Sentry };
