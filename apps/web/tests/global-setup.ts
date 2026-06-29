// vitest globalSetup for the "actions" project — runs ONCE per `vitest run`,
// before any action test file loads. The returned fn runs once at the end.
//
// Mirrors packages/db/tests/global-setup.ts: start Postgres 16 in a container,
// apply the same migrations the app runs against in prod, and broadcast the URL
// via project.provide(). tests/setup.ts (a per-worker setupFile) reads it back
// and points getDb() at the container by setting DATABASE_URL.
//
// Migrations are owned by @fromtheloop/db, so we point the migrator at that
// package's folder rather than duplicating them. Requires Docker (CI ubuntu has
// it preinstalled).

import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../packages/db/src/migrations", import.meta.url),
);

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer("postgres:16")
    .withDatabase("fromtheloop_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const url = container.getConnectionUri();
  const onnotice = (): void => {};

  const bootstrap = postgres(url, { max: 1, prepare: false, onnotice });
  await bootstrap`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await bootstrap.end({ timeout: 5 });

  const client = postgres(url, { max: 1, prepare: false, onnotice });
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
  await client.end({ timeout: 5 });

  project.provide("databaseUrl", url);

  return async (): Promise<void> => {
    await container?.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
