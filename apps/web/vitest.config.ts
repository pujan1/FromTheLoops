// vitest config for apps/web — Phase 1 of docs/testing.md.
//
// Pure-ish lib unit tests only: RBAC/admin gating, rate-limit fail-open,
// view-as impersonation re-checks, and the display formatters. No DB, no
// container — the edges (Clerk, ioredis, next/headers, @fromtheloop/db) are
// mocked per-test. Scoped to lib/**/*.test.ts so it never picks up the
// Playwright e2e specs (e2e/**/*.spec.ts), which run under a different runner.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" -> repo-root alias so lib imports resolve.
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
