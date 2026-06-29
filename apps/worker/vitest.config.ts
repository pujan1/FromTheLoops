// vitest config for @fromtheloop/worker — Phase 3 of docs/testing.md.
//
// The jobs are thin orchestrators over @fromtheloop/db and @fromtheloop/search
// (both already integration-tested against a real Postgres in their own
// packages). So these tests mock those module edges and assert the *worker's*
// own logic: reconcile's per-pass failure isolation, the event-vs-sweep job
// dispatch, debounced karma enqueue, and send-email's no-op/throw branches. No
// container — fast, deterministic, and not a re-test of the DB layer.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
