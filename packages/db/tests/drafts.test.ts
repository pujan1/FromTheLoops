// Sprint 1 Day 6: submission-draft data-access + the per-user cap, and the
// Clerk-id upsert helper. Uses the shared testcontainer (makeTestClient).
// Cleanup deletes the test users in afterAll; drafts CASCADE from users, so
// that reaps every draft this file created without a TRUNCATE lock.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDraft,
  getDraft,
  getOrCreateUserByClerkId,
  listDrafts,
  MAX_DRAFTS_PER_USER,
  pruneStaleDrafts,
  updateDraft,
} from "../src/index.js";
import { drafts, users } from "../src/schema/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

const OWNER_CLERK = "clerk_draft_owner";
const OTHER_CLERK = "clerk_draft_other";

describe("submission drafts", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let ownerId: string;
  let otherId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    ownerId = (await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK })).id;
    otherId = (await getOrCreateUserByClerkId(db, { clerkId: OTHER_CLERK })).id;
  });

  afterAll(async () => {
    // CASCADE from users clears their drafts too.
    await db.delete(users).where(inArray(users.clerkId, [OWNER_CLERK, OTHER_CLERK]));
    await close();
  });

  describe("getOrCreateUserByClerkId", () => {
    it("is idempotent on clerk_id", async () => {
      const a = await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK });
      const b = await getOrCreateUserByClerkId(db, {
        clerkId: OWNER_CLERK,
        email: "owner@example.com",
      });
      expect(a.id).toBe(b.id);
      expect(b.email).toBe("owner@example.com");
    });
  });

  it("creates a draft owned by the user", async () => {
    const d = await createDraft(db, ownerId, { month: "2026-05" });
    expect(d.userId).toBe(ownerId);
    expect(d.data).toEqual({ month: "2026-05" });
  });

  it("getDraft is ownership-scoped", async () => {
    const d = await createDraft(db, ownerId, { note: "mine" });
    expect((await getDraft(db, d.id, ownerId))?.id).toBe(d.id);
    // Another user can't read it, even with the right id.
    expect(await getDraft(db, d.id, otherId)).toBeNull();
    // Unknown id → null.
    expect(
      await getDraft(db, "00000000-0000-0000-0000-000000000000", ownerId),
    ).toBeNull();
  });

  it("updateDraft replaces data, bumps updatedAt, and is ownership-scoped", async () => {
    const d = await createDraft(db, ownerId, { v: 1 });
    const before = d.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateDraft(db, d.id, ownerId, { v: 2 });
    expect(updated?.data).toEqual({ v: 2 });
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    // Foreign id → no-op null.
    expect(await updateDraft(db, d.id, otherId, { v: 3 })).toBeNull();
  });

  it("listDrafts returns the user's drafts, newest-updated first", async () => {
    const fresh = await getOrCreateUserByClerkId(db, {
      clerkId: "clerk_draft_list",
    });
    const a = await createDraft(db, fresh.id, { k: "a" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createDraft(db, fresh.id, { k: "b" });
    const list = await listDrafts(db, fresh.id);
    expect(list.map((d) => d.id)).toEqual([b.id, a.id]);
    await db.delete(users).where(eq(users.clerkId, "clerk_draft_list"));
  });

  it("enforces the per-user cap by pruning oldest on create", async () => {
    const capUser = await getOrCreateUserByClerkId(db, {
      clerkId: "clerk_draft_cap",
    });
    let last = "";
    for (let i = 0; i < MAX_DRAFTS_PER_USER + 2; i++) {
      last = (await createDraft(db, capUser.id, { i })).id;
    }
    const list = await listDrafts(db, capUser.id);
    // Never exceeds the cap...
    expect(list.length).toBe(MAX_DRAFTS_PER_USER);
    // ...and the most recent create always survives the prune.
    expect(list.some((d) => d.id === last)).toBe(true);
    await db.delete(users).where(eq(users.clerkId, "clerk_draft_cap"));
  });

  it("pruneStaleDrafts deletes only drafts older than the cutoff", async () => {
    const stale = await createDraft(db, ownerId, { stale: true });
    // Backdate it 40 days.
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db
      .update(drafts)
      .set({ updatedAt: fortyDaysAgo })
      .where(eq(drafts.id, stale.id));
    const fresh = await createDraft(db, ownerId, { stale: false });

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await pruneStaleDrafts(db, cutoff);

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await getDraft(db, stale.id, ownerId)).toBeNull();
    expect(await getDraft(db, fresh.id, ownerId)).not.toBeNull();
  });
});
