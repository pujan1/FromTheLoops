// `pnpm db:migrate` entrypoint. Wraps drizzle-kit migrate so pgcrypto is created
// before the first migration (needed for gen_random_uuid() defaults). Idempotent.

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: "../../.env.local" });
config({ path: "../../.env" });
config({ path: ".env" });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const onnotice = () => {}; // silence PG NOTICE chatter; errors still reject

  // Bootstrap connection: extension setup only.
  const bootstrap = postgres(url, { max: 1, prepare: false, onnotice });
  await bootstrap`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await bootstrap.end({ timeout: 5 });

  const client = postgres(url, { max: 1, prepare: false, onnotice });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./src/migrations" });
  await client.end({ timeout: 5 });
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
