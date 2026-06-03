import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Minimal user row.
//
// Identity ownership: Clerk owns email/password/sessions; this table only
// exists so other rows (reports, mod actions, verifications) can FK to a
// stable internal UUID instead of a Clerk id (which would couple our schema
// to an external vendor's id format).
//
// Sync model: Clerk webhook → upsert here on user.created / user.updated.
// Until that webhook handler exists, rows are inserted ad hoc by the
// upsert-on-visit path, tests, and the seed script.
//
// Future fields (deferred): karma, role (RBAC), deleted_at for soft-delete.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    clerkId: text("clerk_id"),
    email: text("email"),
    username: text("username"),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_clerk_id_uq").on(t.clerkId),
    uniqueIndex("users_username_uq").on(t.username),
    index("users_email_idx").on(t.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
