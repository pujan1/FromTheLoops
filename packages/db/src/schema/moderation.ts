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

// Append-only moderator audit trail. Polymorphic (target_type, target_id), no
// FK on target_id. RESTRICT on mod_user_id (history can't be dropped). metadata
// jsonb holds per-action context.
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
