// Environment bootstrap. Imported first by index.ts — before Sentry (which
// reads SENTRY_DSN) and before any getDb() call (which needs DATABASE_URL) —
// so process.env is populated for the whole process.
//
// Mirrors the loader in packages/db/drizzle.config.ts: first match wins,
// repo-root .env.local then .env. In production the worker gets its env from
// the compose file, so neither file exists and these calls are silent no-ops.

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// apps/worker/src → repo root is three directories up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(repoRoot, ".env") });
