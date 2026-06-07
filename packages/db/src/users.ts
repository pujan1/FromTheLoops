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

// Fetch by public handle. Drives the /u/[username] profile resolve — the
// username is the URL key (never the internal UUID or Clerk id). Exact match
// on the unique index (users_username_uq); a non-matching handle returns null,
// which the route turns into a 404. null usernames (rows that never set a
// handle) are never returned because the predicate is an equality on a value.
export async function getUserByUsername(
  db: Db,
  username: string,
): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows[0] ?? null;
}

// Header stats for the public profile. `publicReportCount` counts only the
// user's VISIBLE, *attributed* reports — the same display_attribution filter
// the report list applies, so the headline never promises more cards than the
// page shows (anonymous reports stay invisible here, preserving the
// anonymous-by-default contract). `verifiedAtCompanyCount` is the number of
// distinct companies the user holds a verification for (user_verifications) —
// the source of the "verified contributor" badge. Karma is intentionally
// absent: the column lands on Day 7; the profile slots it in then.
export interface UserProfileStats {
  publicReportCount: number;
  verifiedAtCompanyCount: number;
}

export async function getUserProfileStats(
  db: Db,
  userId: string,
): Promise<UserProfileStats> {
  const rows = await db.execute<{
    public_report_count: number | string;
    verified_company_count: number | string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int
         FROM interview_reports r
        WHERE r.created_by_user_id = ${userId}::uuid
          AND r.display_attribution = 'display_name'
          AND r.status = 'active'
          AND r.deleted_at IS NULL) AS public_report_count,
      (SELECT COUNT(DISTINCT v.company_id)::int
         FROM user_verifications v
        WHERE v.user_id = ${userId}::uuid) AS verified_company_count
  `);
  const row = rows[0];
  return {
    publicReportCount: row ? Number(row.public_report_count) : 0,
    verifiedAtCompanyCount: row ? Number(row.verified_company_count) : 0,
  };
}
