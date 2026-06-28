import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { displayAttribution } from "./enums.js";

// Internal user row. Clerk owns identity; this exists so other rows FK to a
// stable internal UUID, synced via Clerk webhook upsert.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    clerkId: text("clerk_id"),
    email: text("email"),
    username: text("username"),
    displayName: text("display_name"),
    defaultDisplayAttribution: displayAttribution("default_display_attribution")
      .notNull()
      .default("anonymous"),
    karma: integer("karma").notNull().default(0), // denormalized; only recompute-karma writes it
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft-delete; row survives as audit anchor
    piiPurgedAt: timestamp("pii_purged_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_clerk_id_uq").on(t.clerkId),
    uniqueIndex("users_username_uq").on(t.username),
    index("users_email_idx").on(t.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
