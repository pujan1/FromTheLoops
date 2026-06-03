// Submission-draft data-access (Sprint 1 Day 6).
//
// One row per in-progress /submit form, keyed by (user). The web layer
// validates `data` against shared's submissionDraftSchema before calling
// these; here it's opaque jsonb. All reads/writes are ownership-scoped by
// userId so a draft id alone never grants access to another user's draft.
//
// Soft cap: MAX_DRAFTS_PER_USER. createDraft prunes the user's least-recently-
// touched drafts (by updatedAt, matching the resume list order) so an
// abandoned-form flood can't grow unbounded. The 30-day TTL prune is a
// separate cron (Sprint 6); this cap is the per-user backstop.

import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { type Draft, drafts } from "./schema/index.js";
import * as schema from "./schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;

export const MAX_DRAFTS_PER_USER = 10;

type DraftData = Record<string, unknown>;

// Ownership-scoped fetch. Returns null if the draft doesn't exist OR belongs
// to another user — callers can't distinguish the two (no existence oracle).
export async function getDraft(
  db: Db,
  id: string,
  userId: string,
): Promise<Draft | null> {
  const rows = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

// A user's drafts, newest-updated first (resume list).
export async function listDrafts(db: Db, userId: string): Promise<Draft[]> {
  return db
    .select()
    .from(drafts)
    .where(eq(drafts.userId, userId))
    .orderBy(desc(drafts.updatedAt));
}

// Insert a new draft, first pruning the user's oldest drafts so the post-
// insert count never exceeds MAX_DRAFTS_PER_USER. Done in a transaction so
// the prune + insert are atomic under concurrent creates.
export async function createDraft(
  db: Db,
  userId: string,
  data: DraftData,
): Promise<Draft> {
  return db.transaction(async (tx) => {
    // Order by updatedAt, not createdAt: the resume list is "most recently
    // touched first", so eviction must drop the *least recently touched*
    // draft. Pruning by creation order would evict a draft the user is still
    // actively resuming/editing just because it was created first.
    const existing = await tx
      .select({ id: drafts.id })
      .from(drafts)
      .where(eq(drafts.userId, userId))
      .orderBy(asc(drafts.updatedAt));

    // Keep at most MAX-1 so this insert lands the user exactly at the cap.
    const overflow = existing.length - (MAX_DRAFTS_PER_USER - 1);
    if (overflow > 0) {
      const doomed = existing.slice(0, overflow).map((r) => r.id);
      await tx
        .delete(drafts)
        .where(and(eq(drafts.userId, userId), inArray(drafts.id, doomed)));
    }

    const inserted = await tx
      .insert(drafts)
      .values({ userId, data })
      .returning();
    return inserted[0]!;
  });
}

// Update an existing draft's data + bump updatedAt. Ownership-scoped: returns
// null if the (id, userId) pair doesn't match, so a stale/foreign id is a
// no-op the caller can react to (e.g. fall back to createDraft).
export async function updateDraft(
  db: Db,
  id: string,
  userId: string,
  data: DraftData,
): Promise<Draft | null> {
  const rows = await db
    .update(drafts)
    .set({ data, updatedAt: new Date() })
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

// Used by the (Sprint 6) TTL cron; exported now so the policy lives with the
// rest of the draft logic. Deletes drafts not updated since `before`.
export async function pruneStaleDrafts(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(drafts)
    .where(lt(drafts.updatedAt, before))
    .returning({ id: drafts.id });
  return rows.length;
}
