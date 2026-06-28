import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  contentFlagReason,
  contentFlagStatus,
  contentFlagTarget,
} from "./enums.js";
import { users } from "./users.js";

// Reader abuse-reports against content (not helpful_flags, which is positive).
// Polymorphic (target_type, target_id) over reports + comments, no FK on
// target_id. A mod resolves each flag (actioned | dismissed).
export const contentFlags = pgTable(
  "content_flags",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    targetType: contentFlagTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    flaggerUserId: uuid("flagger_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: contentFlagReason("reason").notNull(),
    note: text("note"), // free-text PII, cleared by the purge sweep
    status: contentFlagStatus("status").notNull().default("open"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One flag per (reader, content) → flag count = distinct readers.
    uniqueIndex("content_flags_target_flagger_uq").on(
      t.targetType,
      t.targetId,
      t.flaggerUserId,
    ),
    index("content_flags_target_idx").on(t.targetType, t.targetId),
    index("content_flags_flagger_created_idx").on(t.flaggerUserId, t.createdAt), // rate-limit read
  ],
);

export type ContentFlag = typeof contentFlags.$inferSelect;
export type NewContentFlag = typeof contentFlags.$inferInsert;
