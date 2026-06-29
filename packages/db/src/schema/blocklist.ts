import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { blocklistCategory } from "./enums.js";
import { users } from "./users.js";

// Editable slur/PII/spam blocklist (Sprint 6 Day 9). Each row is one
// case-insensitive regex tested against proposed taxonomy names; a match blocks
// heuristic auto-approve (moderation/auto-approve.ts) so the name lands in the
// human queue instead. Hot-reloaded — moderation/blocklist.ts caches the active
// set with a short TTL, so edits here take effect without a redeploy.
//
// The config row IS its own audit record (created_by + timestamps); blocklist
// edits don't write mod_action_logs (mirrors dismissFlags being self-auditing).
// Patterns are admin-authored and trusted: validated to compile at write time,
// but not sandboxed against catastrophic backtracking — keep them simple.
export const regexBlocklist = pgTable(
  "regex_blocklist",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pattern: text("pattern").notNull(),
    label: text("label").notNull(), // human description of what it catches
    category: blocklistCategory("category").notNull().default("other"),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("regex_blocklist_enabled_idx").on(t.enabled)],
);

export type RegexBlocklistEntry = typeof regexBlocklist.$inferSelect;
export type NewRegexBlocklistEntry = typeof regexBlocklist.$inferInsert;
