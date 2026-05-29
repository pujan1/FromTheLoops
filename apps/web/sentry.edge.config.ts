// Sentry edge-runtime init (middleware, edge route handlers). Loaded by
// instrumentation.ts when NEXT_RUNTIME === "edge". Mirrors the server config.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
