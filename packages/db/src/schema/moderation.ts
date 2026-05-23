import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { modActionType } from "./enums.js";
import { users } from "./users.js";

// `mod_action_logs` — append-only audit trail for every moderator
// action. Required by PLAN.md §Section 230 hygiene: "admins never edit
// user content; they approve / reject / hide / delete only, and every
// action is logged."
//
// Polymorphic target: (target_type, target_id) — a single audit table
// spans actions on reports, users, companies, taxonomy edits, etc.
// Indexed on (target_type, target_id) so "show me everything that
// happened to this report" is a fast lookup. No FK constraint on
// target_id because it points at different tables depending on
// target_type; the application is responsible for not lying.
//
// ON DELETE RESTRICT on mod_user_id — mod accounts can't be hard-
// deleted while their action log exists. We don't *want* to delete
// their history; banning a mod sets a flag elsewhere, doesn't drop
// rows.
//
// metadata jsonb: free-form context for the action. e.g. for a `merge`
// action: {"source_id": "...", "target_id": "...", "row_count": 47}.
export const modActionLogs = pgTable(
  "mod_action_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    modUserId: uuid("mod_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actionType: modActionType("action_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("mod_action_target_idx").on(t.targetType, t.targetId),
    index("mod_action_mod_idx").on(t.modUserId),
  ],
);

export type ModActionLog = typeof modActionLogs.$inferSelect;
export type NewModActionLog = typeof modActionLogs.$inferInsert;
