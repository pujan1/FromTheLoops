// vitest config for @fromtheloop/shared. Pure unit tests — no DB, no
// container. Just the Zod validators and anti-abuse helpers.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
