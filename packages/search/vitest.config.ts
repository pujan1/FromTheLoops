// vitest config for @fromtheloop/search — Phase 2 of docs/testing.md.
//
// Pure unit tests: doc-builder shape, the filter_by/query-builder string, and
// the indexer's import/upsert/delete control flow. No Typesense server — the
// `Client` is a hand-rolled fake per test (we assert on the args it receives),
// so these run in-process with no infra. Scoped to src/**/*.test.ts.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
