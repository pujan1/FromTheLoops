// Fuzzy autocomplete + suggest-pending over the pg_trgm indexes. Matching is
// hybrid trigram (`%`) + substring (ILIKE) over name+aliases, active rows only,
// ranked by best similarity. Companies + topics allow suggest-new; roles don't.

import { and, asc, eq, sql } from "drizzle-orm";
import {
  companies,
  type Company,
  type CompanyLevel,
  companyLevels,
  roles,
  type Topic,
  topics,
} from "../schema/index.js";
import type { Db } from "../lib/types.js";
import { slugify } from "./slug.js";

// Type aliases (not interfaces) so they satisfy db.execute<T>()'s index sig.
export type CompanyMatch = {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
};

export type RoleMatch = {
  id: string;
  slug: string;
  name: string;
};

export interface SearchOptions {
  limit?: number;
}

const DEFAULT_LIMIT = 8;

function normalizeQuery(query: string): string {
  return query.trim();
}

export async function searchCompanies(
  db: Db,
  query: string,
  opts: SearchOptions = {},
): Promise<CompanyMatch[]> {
  const q = normalizeQuery(query);
  if (q.length === 0) return [];
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const like = `%${q}%`;

  const rows = await db.execute<CompanyMatch>(sql`
    SELECT id, slug, name, domain
    FROM ${companies}
    WHERE status = 'active'
      AND (
        name % ${q}
        OR taxonomy_aliases_text(aliases) % ${q}
        OR name ILIKE ${like}
        OR taxonomy_aliases_text(aliases) ILIKE ${like}
      )
    ORDER BY
      GREATEST(
        similarity(name, ${q}),
        similarity(taxonomy_aliases_text(aliases), ${q})
      ) DESC,
      name ASC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    domain: r.domain,
  }));
}

export async function searchRoles(
  db: Db,
  query: string,
  opts: SearchOptions = {},
): Promise<RoleMatch[]> {
  const q = normalizeQuery(query);
  if (q.length === 0) return [];
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const like = `%${q}%`;

  const rows = await db.execute<RoleMatch>(sql`
    SELECT id, slug, name
    FROM ${roles}
    WHERE status = 'active'
      AND (
        name % ${q}
        OR taxonomy_aliases_text(aliases) % ${q}
        OR name ILIKE ${like}
        OR taxonomy_aliases_text(aliases) ILIKE ${like}
      )
    ORDER BY
      GREATEST(
        similarity(name, ${q}),
        similarity(taxonomy_aliases_text(aliases), ${q})
      ) DESC,
      name ASC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name }));
}

export type TopicMatch = {
  id: string;
  slug: string;
  name: string;
};

export async function searchTopics(
  db: Db,
  query: string,
  opts: SearchOptions = {},
): Promise<TopicMatch[]> {
  const q = normalizeQuery(query);
  if (q.length === 0) return [];
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const like = `%${q}%`;

  const rows = await db.execute<TopicMatch>(sql`
    SELECT id, slug, name
    FROM ${topics}
    WHERE status = 'active'
      AND (
        name % ${q}
        OR taxonomy_aliases_text(aliases) % ${q}
        OR name ILIKE ${like}
        OR taxonomy_aliases_text(aliases) ILIKE ${like}
      )
    ORDER BY
      GREATEST(
        similarity(name, ${q}),
        similarity(taxonomy_aliases_text(aliases), ${q})
      ) DESC,
      name ASC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name }));
}

export type CompanyLevelOption = {
  id: string;
  slug: string;
  name: string;
  tier: CompanyLevel["tier"]; // null when the rung isn't mapped
};

// Active level ladder for a company, low → high. Empty → form uses "N/A".
export async function getCompanyLevels(
  db: Db,
  companyId: string,
): Promise<CompanyLevelOption[]> {
  const rows = await db
    .select({
      id: companyLevels.id,
      slug: companyLevels.slug,
      name: companyLevels.name,
      tier: companyLevels.tier,
    })
    .from(companyLevels)
    .where(
      and(
        eq(companyLevels.companyId, companyId),
        eq(companyLevels.status, "active"),
      ),
    )
    .orderBy(asc(companyLevels.orderIndex));
  return rows;
}

export interface SuggestCompanyInput {
  name: string;
  suggestedByUserId?: string | null;
}

export interface SuggestCompanyResult {
  company: Company;
  created: boolean; // false when the slug already existed (row returned untouched)
}

// Inserts a user-suggested company as 'pending'. Idempotent on the slug.
export async function suggestCompany(
  db: Db,
  input: SuggestCompanyInput,
): Promise<SuggestCompanyResult> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("suggestCompany: name is empty");
  }
  const slug = slugify(name);
  if (slug.length === 0) {
    throw new Error(`suggestCompany: name produced an empty slug: ${name}`);
  }

  const inserted = await db
    .insert(companies)
    .values({
      slug,
      name,
      status: "pending",
      source: "user_suggested",
      suggestedByUserId: input.suggestedByUserId ?? null,
    })
    .onConflictDoNothing({ target: companies.slug })
    .returning();

  const insertedRow = inserted[0];
  if (insertedRow) {
    return { company: insertedRow, created: true };
  }

  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);
  const existingRow = existing[0];
  if (!existingRow) {
    throw new Error(`suggestCompany: slug ${slug} conflicted but no row found`);
  }
  return { company: existingRow, created: false };
}

export interface SuggestTopicInput {
  name: string;
  suggestedByUserId?: string | null;
}

export interface SuggestTopicResult {
  topic: Topic;
  created: boolean; // false when the slug already existed
}

// Inserts a user-suggested topic tag as 'pending'. Idempotent on the slug.
export async function suggestTopic(
  db: Db,
  input: SuggestTopicInput,
): Promise<SuggestTopicResult> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("suggestTopic: name is empty");
  }
  const slug = slugify(name);
  if (slug.length === 0) {
    throw new Error(`suggestTopic: name produced an empty slug: ${name}`);
  }

  const inserted = await db
    .insert(topics)
    .values({
      slug,
      name,
      status: "pending",
      source: "user_suggested",
      suggestedByUserId: input.suggestedByUserId ?? null,
    })
    .onConflictDoNothing({ target: topics.slug })
    .returning();

  const insertedRow = inserted[0];
  if (insertedRow) {
    return { topic: insertedRow, created: true };
  }

  const existing = await db
    .select()
    .from(topics)
    .where(eq(topics.slug, slug))
    .limit(1);
  const existingRow = existing[0];
  if (!existingRow) {
    throw new Error(`suggestTopic: slug ${slug} conflicted but no row found`);
  }
  return { topic: existingRow, created: false };
}
