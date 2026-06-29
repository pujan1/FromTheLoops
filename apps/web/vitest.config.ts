// vitest config for apps/web — two projects, one `vitest run`.
//
// "lib" (Phase 1): pure-ish lib unit tests — RBAC/admin gating, rate-limit
// fail-open, view-as re-checks, formatters. No DB, no container; the edges
// (Clerk, ioredis, next/headers, @fromtheloop/db) are mocked per-test.
//
// "actions" (Phase 4): server-action integration tests. These run against a
// real throwaway Postgres (Testcontainers) and mock only the framework edges
// (Clerk auth/currentUser, next/cache, next/headers, next/navigation). The
// container is started once per run by tests/global-setup.ts; tests/setup.ts
// points getDb() at it and truncates between cases.
//
// Both are scoped away from the Playwright e2e specs (e2e/**/*.spec.ts), which
// run under a different runner.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  // Mirror the tsconfig "@/*" -> repo-root alias so imports resolve.
  "@": fileURLToPath(new URL("./", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "lib",
          environment: "node",
          include: ["lib/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "actions",
          environment: "node",
          include: ["app/**/*.test.ts"],
          globalSetup: ["./tests/global-setup.ts"],
          setupFiles: ["./tests/setup.ts"],
          // One shared container; truncating between files concurrently would
          // race, so run action files serially in a forked process (matches
          // packages/db). getDb() reads env, which forks isolate cleanly.
          pool: "forks",
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
