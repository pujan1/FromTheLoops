// Deliberate error for verifying the worker's Sentry pipeline end-to-end.
//   pnpm --filter @fromtheloop/worker sentry:test   (with SENTRY_DSN set)
// Captures a test exception, flushes (short-lived process would otherwise
// exit before the event is sent), then exits.
import { Sentry } from "../sentry.js";

async function main() {
  const err = new Error("Sentry test error (worker): sentry:test script");
  Sentry.captureException(err);
  const sent = await Sentry.flush(5000);
  console.log(`[sentry:test] captured; flush ${sent ? "ok" : "timed out"}`);
  process.exit(sent ? 0 : 1);
}

void main();
