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
import { taxonomySource, taxonomyStatus } from "./enums.js";
import { users } from "./users.js";

// Curated taxonomy: companies, roles, topics, per-company levels. FK
// targets for reports/questions/verifications. See PLAN.md §Data model.
//
// Curation model (PLAN.md §Taxonomy curation):
//   - companies + levels: inline "create pending" allowed; mod approves later.
//   - roles: NO inline create — users only match existing rows. `roles` IS
//     the canonical-roles table (the doc's `canonical_roles`); kept this
//     name since reports.canonical_role_id + the wedge index FK to it.

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // Alternate names, matched alongside `name` by fuzzy search.
    aliases: text("aliases").array().notNull().default(sql`'{}'`),
    // Primary email domain for work-email verification matching (Sprint 3).
    domain: text("domain"),
    status: taxonomyStatus("status").notNull().default("active"),
    source: taxonomySource("source").notNull().default("user_suggested"),
    // Who suggested a pending company (null for seed rows).
    suggestedByUserId: uuid("suggested_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_slug_uq").on(t.slug),
    index("companies_status_idx").on(t.status),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'`),
    status: taxonomyStatus("status").notNull().default("active"),
    source: taxonomySource("source").notNull().default("user_suggested"),
    // Self-FK: a merged/duplicate role points at its canonical row.
    // (drizzle needs the explicit AnyPgColumn return type for self-refs.)
    mergedIntoId: uuid("merged_into_id").references(
      (): import("drizzle-orm/pg-core").AnyPgColumn => roles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("roles_slug_uq").on(t.slug),
    index("roles_status_idx").on(t.status),
  ],
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

// Per-company levels (Amazon SDE II, Google L4, Meta E4) — meaningless
// across companies, so they hang off one. A company with none falls back
// to the "N/A" form sentinel (no row). CASCADE from companies.
export const companyLevels = pgTable(
  "company_levels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // Ladder order (L3 < L4 < L5) — levels don't sort lexically.
    orderIndex: integer("order_index").notNull().default(0),
    status: taxonomyStatus("status").notNull().default("active"),
    source: taxonomySource("source").notNull().default("user_suggested"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("company_levels_company_slug_uq").on(t.companyId, t.slug),
    index("company_levels_company_idx").on(t.companyId),
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type CompanyLevel = typeof companyLevels.$inferSelect;
export type NewCompanyLevel = typeof companyLevels.$inferInsert;
