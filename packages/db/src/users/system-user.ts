// The "Auto-moderator" actor that owns heuristic auto-approvals (mod_user_id is
// NOT NULL). A real users row with a reserved clerk_id no Clerk principal can
// produce, so it never collides with a real user and never authenticates.

import { eq } from "drizzle-orm";
import { users, type User } from "../schema/index.js";
import type { Db } from "../lib/types.js";

// Reserved clerk_id — the ':' makes it unproducible by a real Clerk id.
export const SYSTEM_USER_CLERK_ID = "system:auto-moderator";
export const SYSTEM_USER_USERNAME = "auto-moderator";

// Idempotent: returns the existing system user or creates it on first call.
// Keyed on the reserved clerk_id (unique), so concurrent first-calls converge.
export async function getOrCreateSystemUser(db: Db): Promise<User> {
  const inserted = await db
    .insert(users)
    .values({
      clerkId: SYSTEM_USER_CLERK_ID,
      username: SYSTEM_USER_USERNAME,
      displayName: "Auto-moderator",
    })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();
  if (inserted[0]) return inserted[0];

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, SYSTEM_USER_CLERK_ID))
    .limit(1);
  const row = existing[0];
  if (!row) throw new Error("getOrCreateSystemUser: row vanished after upsert");
  return row;
}
