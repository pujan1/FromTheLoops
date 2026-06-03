// User data-access helpers.
//
// Identity ownership: Clerk owns auth; this table holds a stable internal
// UUID that everything else FKs to (see schema/users.ts). Until the Clerk
// webhook sync lands, every authenticated entry point upserts-on-visit via
// getOrCreateUserByClerkId so a `users` row is guaranteed to exist before we
// write anything that references it (drafts, reports, …).

import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";
import { type User, users } from "./schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;

export interface ClerkIdentity {
  clerkId: string;
  email?: string | null;
}

// Idempotent on clerk_id (users_clerk_id_uq). Refreshes email on repeat
// visits; returns the internal row so callers get the UUID to FK against.
export async function getOrCreateUserByClerkId(
  db: Db,
  identity: ClerkIdentity,
): Promise<User> {
  const rows = await db
    .insert(users)
    .values({ clerkId: identity.clerkId, email: identity.email ?? null })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email: sql`excluded.email` },
    })
    .returning();
  if (rows[0]) return rows[0];

  // onConflictDoUpdate returns the row in practice; this fallback guards the
  // theoretical empty-returning case rather than handing back undefined.
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, identity.clerkId))
    .limit(1);
  const row = existing[0];
  if (!row) {
    throw new Error(`getOrCreateUserByClerkId: no row for ${identity.clerkId}`);
  }
  return row;
}

// Fetch by internal id. Used by the new-user moderation-hold decision, which
// needs the account's created_at to measure age. null if no such row.
export async function getUserById(db: Db, id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}
