// Sprint 1 Day 3: taxonomy lookup (fuzzy autocomplete) + suggest-pending.
//
// These are query helpers — pure data access against the trigram indexes
// added in migration 0002. The submission form (Day 5) and <Combobox>
// (Day 4) consume them through the /api/taxonomy/* route handlers.
//
// Matching strategy (PLAN.md §Taxonomy curation, risk: "feels sluggish"):
//   - Hybrid fuzzy + substring: `name % q` (trigram similarity, catches
//     typos) OR `name ILIKE %q%` (substring, catches mid-word matches the
//     similarity threshold would miss). Both operators ride the
//     gin_trgm_ops indexes, so the whole WHERE stays index-able as the
//     taxonomy grows past the seeded 30/20 rows.
//   - Aliases ("Facebook" → Meta) matched the same way via the
//     array_to_string(aliases, ' ') expression indexes.
//   - status = 'active' only: pending suggestions don't pollute results
//     until a mod approves them.
//   - Ranked by best similarity across name+aliases, then name asc for a
//     stable tiebreak.
//
// Companies and topics allow inline "suggest new → pending" (suggestCompany,
// suggestTopic). Roles do NOT — they're a closed canonical set; the search
// helper is the only role surface and there is deliberately no role-suggest
// export here.

import { and, asc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  companies,
  type Company,
  companyLevels,
  roles,
  type Topic,
  topics,
} from "./schema/index.js";
import * as schema from "./schema/index.js";
import { slugify } from "./slug.js";

// Loose db type so both getDb()'s client and the test client satisfy it.
type Db = PostgresJsDatabase<typeof schema>;

// Type aliases (not interfaces) so they carry an implicit index signature —
// db.execute<T>() constrains T to Record<string, unknown>.
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
  // Max rows returned. Autocomplete dropdowns show a handful; default 8.
  limit?: number;
}

const DEFAULT_LIMIT = 8;

// Clamp the trim'd query; an empty query yields no matches (don't dump the
// whole table into a dropdown).
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

// Topic-tag autocomplete for the question tagger (Sprint 2 Day 3). Identical
// hybrid match to searchCompanies/searchRoles over the topics_name_trgm_idx /
// topics_aliases_trgm_idx indexes (migration 0004). status='active' only, so
// user-suggested-pending tags stay out of the dropdown until a mod promotes
// them — which is also why a pending tag can't satisfy the ≥1-active-tag
// rule.
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
};

// The active level ladder for a company, low → high (order_index). Drives
// the submission form's Level field; an empty result means the company has
// no ladder yet and the form falls back to the "N/A" sentinel.
export async function getCompanyLevels(
  db: Db,
  companyId: string,
): Promise<CompanyLevelOption[]> {
  const rows = await db
    .select({
      id: companyLevels.id,
      slug: companyLevels.slug,
      name: companyLevels.name,
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
  // Clerk-mapped user id; null is allowed (suggested_by_user_id is SET NULL
  // on user delete) but in practice the submission flow always has a user.
  suggestedByUserId?: string | null;
}

export interface SuggestCompanyResult {
  company: Company;
  // false when the slug already existed (active seed OR a prior pending
  // suggestion) — caller can surface "this already exists" instead of
  // double-creating. We never mutate the existing row (an active company
  // must not be flipped back to pending).
  created: boolean;
}

// Insert a user-suggested company as status = 'pending'. Idempotent on the
// slug: if a row already exists (seeded-active or previously-suggested), it
// is returned untouched with created = false.
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

  // Slug collided — fetch the existing row to return.
  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);
  const existingRow = existing[0];
  if (!existingRow) {
    // Conflict fired but the row vanished (concurrent delete) — surface it
    // rather than returning undefined behind a Company-typed field.
    throw new Error(`suggestCompany: slug ${slug} conflicted but no row found`);
  }
  return { company: existingRow, created: false };
}

export interface SuggestTopicInput {
  name: string;
  // Clerk-mapped user id; null allowed (suggested_by_user_id is SET NULL on
  // user delete) but the submission flow always has a user.
  suggestedByUserId?: string | null;
}

export interface SuggestTopicResult {
  topic: Topic;
  // false when the slug already existed (active seed OR a prior pending
  // suggestion). We never mutate the existing row.
  created: boolean;
}

// Insert a user-suggested topic tag as status = 'pending'. Idempotent on the
// slug, exactly like suggestCompany — topics are the other taxonomy that
// allows inline suggest-new (roles do not). A pending tag is created so a mod
// can promote it later; until then it stays out of searchTopics and does not
// count toward a question's ≥1-active-tag requirement.
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

  // Slug collided — fetch the existing row to return.
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
