// vitest config for @fromtheloop/db.
//
// Design: one Postgres container per `vitest run` invocation, shared
// across all test files. Tests truncate between cases for isolation
// rather than recreating the schema. This trades isolation purity for
// runtime — a per-file container model would be ~5× slower with no
// behavioral upside for our test set.
//
// The config below makes that work:
//   - globalSetup: tests/global-setup.ts starts the container and
//     `provide`s the DATABASE_URL.
//   - pool: "forks": run in a forked process (not threads). Threads
//     would share more state with the main vitest process; forks are
//     cleaner for tests that touch global state like env vars.
//   - fileParallelism: false: run test files serially. Each file holds
//     a fresh client connected to the shared container; without this,
//     concurrent TRUNCATE between files would race.
//   - isolate: false: don't recreate the worker context per file. The
//     shared container/URL doesn't need re-injection per file.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    isolate: false,
    // testcontainers startup can stretch to ~10s on a cold Docker daemon;
    // the hook timeout has to be > that. Individual tests stay under 30s.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.ts"],
  },
});
