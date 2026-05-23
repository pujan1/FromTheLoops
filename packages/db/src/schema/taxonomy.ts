import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Curated taxonomy: companies, roles, topics. These three tables are the
// FK targets for everything else (reports, questions, verifications) so
// they have to exist in Sprint 0 even though the curation logic itself
// lands later.
//
// Curation model (PLAN.md §Taxonomy curation — "D-hybrid for all three"):
//   - Autocomplete suggests existing rows on submission
//   - For companies + topics: inline "create pending" is allowed; mod
//     approves/rejects/merges later
//   - For roles: NO inline create (wedge-critical to keep tight); only
//     pending aliases to canonical roles
//
// Sprint 1 will add:
//   - `aliases[]` for alternative names users type
//   - `status` enum (pending / approved / merged_into) — pending rows
//     don't appear in autocomplete, only the mod queue
//   - `merged_into_id` self-FK for canonical-role redirect chains
//   - For companies: `domain` for email-based verification matching
//
// For now: id + slug + name + timestamps. Just enough to FK.

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("companies_slug_uq").on(t.slug)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("roles_slug_uq").on(t.slug)],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("topics_slug_uq").on(t.slug)],
);

export type Company = typeof companies.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Topic = typeof topics.$inferSelect;
