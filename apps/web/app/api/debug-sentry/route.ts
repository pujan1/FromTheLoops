// Deliberate error endpoint for verifying the Sentry pipeline end-to-end.
// Hit GET /api/debug-sentry on a deployment with SENTRY_DSN set; the thrown
// error is captured by the onRequestError hook in instrumentation.ts and
// should appear in the Sentry project within seconds. Safe to keep around —
// it only ever throws, returns nothing useful.
export const dynamic = "force-dynamic";

export function GET() {
  throw new Error("Sentry test error (web): /api/debug-sentry");
}
