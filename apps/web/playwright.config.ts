import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load the web app's env into the test-runner process. global.setup.ts talks
// to Clerk's Backend API (CLERK_SECRET_KEY) and mints a testing token
// (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY); the dev server reads the same file
// itself. Root .env.local is a fallback for shared keys (DATABASE_URL etc).
dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

// Clerk's backend SDK (used by clerk.signIn) starts a telemetry batching
// timer that keeps the Playwright worker process alive after the tests pass,
// so Playwright force-kills it after its teardown grace and exits non-zero.
// Disabling telemetry lets the worker exit cleanly. Set before any Clerk code
// loads, and propagated to the dev server below.
process.env.CLERK_TELEMETRY_DISABLED = "1";

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

// We run against the system Chrome (channel: "chrome") so CI/dev don't need a
// separate Playwright browser download — the box already has it.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global.setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { CLERK_TELEMETRY_DISABLED: "1" },
  },
});
