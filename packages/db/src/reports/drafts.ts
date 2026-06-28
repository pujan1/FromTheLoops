// Submission drafts. `data` is opaque jsonb here (validated upstream). All
// reads/writes are ownership-scoped by userId. createDraft enforces a per-user
// soft cap; a separate TTL cron handles the 30-day prune.

import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { type Draft, drafts } from "../schema/index.js";
import type { Db } from "../lib/types.js";

export const MAX_DRAFTS_PER_USER = 10;

type DraftData = Record<string, unknown>;

// Ownership-scoped: null if missing or owned by another user (no existence oracle).
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

export async function listDrafts(db: Db, userId: string): Promise<Draft[]> {
  return db
    .select()
    .from(drafts)
    .where(eq(drafts.userId, userId))
    .orderBy(desc(drafts.updatedAt));
}

// Prunes the user's oldest drafts (by updatedAt) so the post-insert count stays
// at the cap. Atomic under concurrent creates.
export async function createDraft(
  db: Db,
  userId: string,
  data: DraftData,
): Promise<Draft> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: drafts.id })
      .from(drafts)
      .where(eq(drafts.userId, userId))
      .orderBy(asc(drafts.updatedAt));

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

// Ownership-scoped: null if (id, userId) doesn't match.
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

// Ownership-scoped delete. False if (id, userId) matched nothing.
export async function deleteDraft(
  db: Db,
  id: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .delete(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
    .returning({ id: drafts.id });
  return rows.length > 0;
}

// TTL cron: deletes drafts not updated since `before`.
export async function pruneStaleDrafts(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(drafts)
    .where(lt(drafts.updatedAt, before))
    .returning({ id: drafts.id });
  return rows.length;
}
