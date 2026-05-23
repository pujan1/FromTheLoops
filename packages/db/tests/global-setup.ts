// vitest globalSetup — runs ONCE per `vitest run` invocation, before any
// test file is loaded. The returned function runs once at the end, after
// all tests finish.
//
// Lifecycle:
//   1. Start Postgres 16 in a Docker container (testcontainers picks a
//      random free port; no clashes with local docker-compose).
//   2. Enable pgcrypto extension (gen_random_uuid() needs it).
//   3. Apply every migration in src/migrations/*.sql.
//   4. project.provide("databaseUrl", url) — broadcasts the URL to test
//      files via vitest's inject() API.
//   5. Tests run; each file connects, truncates between cases.
//   6. teardown: container.stop() — Docker reaps the container.
//
// Requires Docker. CI: GitHub Actions ubuntu-latest has Docker preinstalled,
// no extra setup needed.

import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
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

  // Apply migrations into the fresh container. Tests truncate between cases;
  // the schema itself is built once.
  const onnotice = (): void => {};
  const bootstrap = postgres(url, { max: 1, prepare: false, onnotice });
  await bootstrap`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await bootstrap.end({ timeout: 5 });

  const client = postgres(url, { max: 1, prepare: false, onnotice });
  await migrate(drizzle(client), { migrationsFolder: "./src/migrations" });
  await client.end({ timeout: 5 });

  project.provide("databaseUrl", url);

  return async (): Promise<void> => {
    await container?.stop();
  };
}

// Module augmentation: tells TypeScript what keys are valid for
// project.provide() and inject(). Without this, `inject("databaseUrl")`
// in tests would be typed as `unknown`.
declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
