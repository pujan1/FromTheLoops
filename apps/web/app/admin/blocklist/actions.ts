"use server";

// Server actions for the editable slur/PII/spam blocklist (Sprint 6 Day 9).
// Admin-only (above the moderator floor that gates the rest of /admin) — these
// patterns govern what auto-promotes without review, so editing them is a
// higher-trust action. Every entry point re-asserts requireAdmin().
//
// The regex_blocklist row is its own audit record (created_by + timestamps), so
// these don't write mod_action_logs (mirrors dismissFlags being self-auditing).

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  addBlocklistEntry,
  BlocklistError,
  type BlocklistCategory,
  getDb,
  getOrCreateUserByClerkId,
  removeBlocklistEntry,
  setBlocklistEnabled,
} from "@fromtheloop/db";
import { requireAdmin } from "@/lib/admin";

type Result = { ok: true } | { ok: false; error: string };

const CATEGORIES: BlocklistCategory[] = ["slur", "pii", "spam", "other"];

export async function createBlocklistEntry(input: {
  pattern: string;
  label: string;
  category: string;
}): Promise<Result> {
  await requireAdmin();

  const category = (CATEGORIES as string[]).includes(input.category)
    ? (input.category as BlocklistCategory)
    : "other";

  const user = await currentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const db = getDb();
  const admin = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress,
  });

  try {
    await addBlocklistEntry(db, {
      pattern: input.pattern,
      label: input.label,
      category,
      createdByUserId: admin.id,
    });
  } catch (err) {
    if (err instanceof BlocklistError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not add the entry." };
  }

  revalidatePath("/admin/blocklist");
  return { ok: true };
}

export async function toggleBlocklistEntry(id: string, enabled: boolean): Promise<Result> {
  await requireAdmin();
  const changed = await setBlocklistEnabled(getDb(), id, enabled);
  if (!changed) return { ok: false, error: "Entry not found." };
  revalidatePath("/admin/blocklist");
  return { ok: true };
}

export async function deleteBlocklistEntry(id: string): Promise<Result> {
  await requireAdmin();
  const changed = await removeBlocklistEntry(getDb(), id);
  if (!changed) return { ok: false, error: "Entry not found." };
  revalidatePath("/admin/blocklist");
  return { ok: true };
}
