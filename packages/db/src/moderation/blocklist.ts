// Editable slur/PII/spam blocklist (Sprint 6 Day 9).
//
// Each row is a case-insensitive regex tested against proposed taxonomy names.
// A match blocks heuristic auto-approve (auto-approve.ts) — the name still gets
// suggested, it just lands in the human queue instead of self-promoting. This is
// the editable layer on top of nameLooksClean()'s fixed structural sanity check.
//
// Hot-reload: the active set is cached in-process with a short TTL so the inline
// suggest path doesn't query on every keystroke-driven submit, yet edits in the
// admin UI propagate without a redeploy. The web mutation actions call
// invalidateBlocklistCache() for instant in-process propagation; other processes
// (the worker) pick changes up within BLOCKLIST_TTL_MS.
//
// Patterns are admin-authored and trusted. We validate they compile at write
// time, but do NOT sandbox against catastrophic backtracking — keep entries
// simple (this is documented in the admin UI).

import { desc, eq } from "drizzle-orm";
import { regexBlocklist } from "../schema/index.js";
import type { BlocklistCategory } from "./types.js";
import type { Db } from "./shared.js";

export const BLOCKLIST_TTL_MS = 60_000;
const PATTERN_MAX = 200;

export type BlocklistEntry = {
  id: string;
  pattern: string;
  label: string;
  category: BlocklistCategory;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class BlocklistError extends Error {}

// Thrown by addBlocklistEntry when the input is unusable. Validation is shared
// with the admin UI (which calls validateBlocklistInput first for inline errors).
export function validateBlocklistInput(input: {
  pattern: string;
  label: string;
}): string | null {
  const pattern = input.pattern.trim();
  const label = input.label.trim();
  if (!pattern) return "Pattern is required.";
  if (pattern.length > PATTERN_MAX) return `Pattern must be ≤ ${PATTERN_MAX} characters.`;
  if (!label) return "Label is required.";
  try {
    new RegExp(pattern, "i");
  } catch (err) {
    return `Invalid regex: ${err instanceof Error ? err.message : "could not compile"}`;
  }
  return null;
}

type Compiled = { label: string; re: RegExp };
let cache: { compiled: Compiled[]; fetchedAt: number } | null = null;

// Clears the in-process cache so the next match reloads from the DB. Called by
// the admin mutation actions after any edit.
export function invalidateBlocklistCache(): void {
  cache = null;
}

async function loadActive(db: Db): Promise<Compiled[]> {
  if (cache && Date.now() - cache.fetchedAt < BLOCKLIST_TTL_MS) {
    return cache.compiled;
  }
  const rows = await db
    .select({ pattern: regexBlocklist.pattern, label: regexBlocklist.label })
    .from(regexBlocklist)
    .where(eq(regexBlocklist.enabled, true));

  const compiled: Compiled[] = [];
  for (const r of rows) {
    try {
      compiled.push({ label: r.label, re: new RegExp(r.pattern, "i") });
    } catch {
      // A row that somehow no longer compiles is skipped, not fatal — never let
      // one bad pattern take the whole blocklist (and thus auto-approve) down.
    }
  }
  cache = { compiled, fetchedAt: Date.now() };
  return compiled;
}

// Returns the label of the first active pattern the name trips, or null. Used as
// the auto-approve "name not blocked" signal; the label feeds the audit reason.
export async function nameMatchesBlocklist(db: Db, name: string): Promise<string | null> {
  const compiled = await loadActive(db);
  for (const c of compiled) {
    if (c.re.test(name)) return c.label;
  }
  return null;
}

// ---- Admin CRUD ----

export async function listBlocklist(
  db: Db,
  opts: { includeDisabled?: boolean } = {},
): Promise<BlocklistEntry[]> {
  const rows = await db
    .select()
    .from(regexBlocklist)
    .orderBy(desc(regexBlocklist.createdAt));
  const items = rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    label: r.label,
    category: r.category,
    enabled: r.enabled,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
  return opts.includeDisabled === false ? items.filter((i) => i.enabled) : items;
}

export async function addBlocklistEntry(
  db: Db,
  input: {
    pattern: string;
    label: string;
    category: BlocklistCategory;
    createdByUserId: string;
  },
): Promise<BlocklistEntry> {
  const error = validateBlocklistInput(input);
  if (error) throw new BlocklistError(error);

  const [row] = await db
    .insert(regexBlocklist)
    .values({
      pattern: input.pattern.trim(),
      label: input.label.trim(),
      category: input.category,
      createdByUserId: input.createdByUserId,
    })
    .returning();
  if (!row) throw new BlocklistError("Insert returned no row.");
  invalidateBlocklistCache();
  return {
    id: row.id,
    pattern: row.pattern,
    label: row.label,
    category: row.category,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Returns false if no row matched the id (idempotent no-op).
export async function setBlocklistEnabled(
  db: Db,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const updated = await db
    .update(regexBlocklist)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(regexBlocklist.id, id))
    .returning({ id: regexBlocklist.id });
  invalidateBlocklistCache();
  return updated.length > 0;
}

export async function removeBlocklistEntry(db: Db, id: string): Promise<boolean> {
  const deleted = await db
    .delete(regexBlocklist)
    .where(eq(regexBlocklist.id, id))
    .returning({ id: regexBlocklist.id });
  invalidateBlocklistCache();
  return deleted.length > 0;
}
