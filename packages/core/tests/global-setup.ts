// vitest globalSetup — starts one Postgres container for the whole `vitest run`
// and applies the db package's migrations into it, then broadcasts the URL via
// inject(). Mirrors packages/db/tests/global-setup.ts; the only difference is
// the migrations folder lives in the sibling db package (core has no migrations
// of its own — it reuses the shared schema).

import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer("postgres:16")
    .withDatabase("fromtheloop_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const url = container.getConnectionUri();
  const onnotice = (): void => {};

  // gen_random_uuid() needs pgcrypto (same as the db package's setup).
  const bootstrap = postgres(url, { max: 1, prepare: false, onnotice });
  await bootstrap`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await bootstrap.end({ timeout: 5 });

  // The db package owns the migrations (core reuses the shared schema). This
  // file is packages/core/tests/global-setup.ts → ../../db/src/migrations.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(here, "../../db/src/migrations");

  const client = postgres(url, { max: 1, prepare: false, onnotice });
  await migrate(drizzle(client), { migrationsFolder });
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
