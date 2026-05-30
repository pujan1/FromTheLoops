import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// Server-side submission drafts — one in-progress /submit form per row,
// resumed from /drafts/[id]. Auto-saved (debounced server action) so a
// refresh never loses work. `data` is the partial form state as jsonb,
// validated against shared's draftDataSchema before write; kept schema-light
// so it doesn't track the evolving reports/rounds tables. CASCADE from users
// (throwaway scratch, no audit value). Abandoned-draft prune cron: Sprint 6.
export const drafts = pgTable(
  "submission_drafts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    data: jsonb("data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Bumped on every save; drives the 30-day TTL prune.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("drafts_user_idx").on(t.userId)],
);

export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
