// vitest config for @fromtheloop/core. The finalize orchestrator writes real
// rows, so its test runs against a throwaway Postgres container — same model as
// @fromtheloop/db's config (one container per `vitest run`, shared across
// files, migrations applied once). See packages/db/vitest.config.ts for the
// rationale behind forks / no-parallelism / no-isolate.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.ts"],
  },
});
