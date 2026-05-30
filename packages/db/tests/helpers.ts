// Shared test utilities — DB client construction, truncation, and a
// Postgres-error matcher that asserts on SQLSTATE codes instead of
// message text.

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inject } from "vitest";
import * as schema from "../src/schema/index.js";

export type TestDb = PostgresJsDatabase<typeof schema>;

// Each test file calls this in beforeAll to get a fresh client connected
// to the shared container (URL provided by tests/global-setup.ts). We use
// the same prepare:false setting as the production client so behavior
// matches end-to-end.
export function makeTestClient(): {
  db: TestDb;
  client: ReturnType<typeof postgres>;
} {
  const url = inject("databaseUrl");
  const client = postgres(url, {
    max: 4,
    prepare: false,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

// Truncate order: children first, then parents. TRUNCATE ... CASCADE
// handles the FK chain automatically, but listing children-first means
// the cascade is a no-op (faster, more deterministic) and the order
// reads as documentation of the dependency graph.
//
// RESTART IDENTITY: resets sequences so test runs don't accumulate
// auto-increment drift across cases.
const TRUNCATE_TABLES = [
  "question_topics",
  "questions",
  "rounds",
  "mod_action_logs",
  "user_verifications",
  "interview_reports",
  "submission_drafts",
  "company_levels",
  "topics",
  "roles",
  "companies",
  "users",
];

export async function truncateAll(db: TestDb): Promise<void> {
  const list = TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}

// Postgres SQLSTATE codes we assert against. These are the stable
// machine-readable error categories; we match on them instead of
// `.message` because Drizzle wraps postgres-js errors and rewrites the
// message text ("Failed query: ..."), but the underlying SQLSTATE is
// preserved on .code or .cause.code.
//
// Full reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
export const PG_FK_VIOLATION = "23503"; // foreign_key_violation
export const PG_UNIQUE_VIOLATION = "23505"; // unique_violation
export const PG_INVALID_TEXT_REPRESENTATION = "22P02"; // bad enum cast, bad uuid, etc.

// Asserts that `promise` rejects with a Postgres error whose SQLSTATE
// matches `code`. Walks both `.code` (top-level) and `.cause.code`
// (Drizzle wrapper) since both shapes appear depending on the call site.
export async function expectPgError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (e) {
    caught = e;
  }
  if (caught === undefined) {
    throw new Error(`expected promise to reject with PG error ${code}`);
  }
  const err = caught as { code?: string; cause?: { code?: string } };
  const found = err.code ?? err.cause?.code;
  if (found !== code) {
    throw new Error(
      `expected PG error code ${code}, got ${String(found)}; full error: ${String(caught)}`,
    );
  }
}
