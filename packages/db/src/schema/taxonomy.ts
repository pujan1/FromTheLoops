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
import {
  levelTier,
  taxonomySource,
  taxonomyStatus,
  topicCategory,
} from "./enums.js";
import { users } from "./users.js";

// Curated taxonomy: companies, roles, topics, per-company levels.
// Companies/topics/levels allow inline "create pending"; roles do not (match
// existing only). `roles` is the canonical-roles table.

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'`),
    domain: text("domain"), // for work-email verification matching
    status: taxonomyStatus("status").notNull().default("active"),
    source: taxonomySource("source").notNull().default("user_suggested"),
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
    // Self-FK to the canonical row (explicit AnyPgColumn type required by drizzle).
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

// Topic tags (≥1 active tag required per question, enforced in the submission
// validator). Like companies, allows inline suggest → pending.
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'`),
    category: topicCategory("category"),
    status: taxonomyStatus("status").notNull().default("active"),
    source: taxonomySource("source").notNull().default("user_suggested"),
    suggestedByUserId: uuid("suggested_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("topics_slug_uq").on(t.slug),
    index("topics_status_idx").on(t.status),
  ],
);

// Per-company levels (Amazon SDE II, Google L4) — hang off one company, CASCADE.
export const companyLevels = pgTable(
  "company_levels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    orderIndex: integer("order_index").notNull().default(0), // ladder order; levels don't sort lexically
    tier: levelTier("tier"),
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
export type NewTopic = typeof topics.$inferInsert;
export type CompanyLevel = typeof companyLevels.$inferSelect;
export type NewCompanyLevel = typeof companyLevels.$inferInsert;
