// Sprint 1 Day 2 deliverable: the curated taxonomy fixtures — 30 top tech
// companies (with per-company level ladders) and ~20 canonical engineering
// roles. Everything here is `source = 'seed_curated'`, `status = 'active'`,
// so it shows up in autocomplete immediately (PLAN.md §Taxonomy curation).
//
// This is the data layer only; the search/suggest logic lands Day 3 and the
// <Combobox> Day 4. Kept as plain exported arrays so tests + future tooling
// (mod queue, fixtures) can import the canonical set without a DB round-trip.
//
// Idempotent: seedCurated() upserts on the natural keys (company slug, role
// slug, company_id+level slug), so re-running refreshes edits in place
// without duplicating or erroring.

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";
import { companies, companyLevels, roles } from "../schema/index.js";

// Minimal DB type: a Drizzle postgres-js client bound to our schema. Both
// getDb()'s client and the test client (helpers.ts `TestDb`) satisfy this —
// they differ only in the optional `$client` field, which the seed never
// touches. Typing the param this loosely keeps seedCurated() callable from
// tests without dragging in the production client's exact shape.
type Db = PostgresJsDatabase<typeof schema>;

export interface CuratedCompany {
  slug: string;
  name: string;
  domain: string;
  aliases?: string[];
  // Ladder, low → high. Order is preserved as company_levels.order_index
  // since level names don't sort lexically (L3 < L4 < L5, E3 < E4 …).
  levels: string[];
}

export interface CuratedRole {
  slug: string;
  name: string;
  aliases?: string[];
}

// Level slugs are derived from the display name (unique within a company,
// which is all the (company_id, slug) constraint requires).
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 30 companies. Ladders are the public/known IC engineering tracks; where a
// company is famously flat (Netflix) the ladder is short on purpose.
export const CURATED_COMPANIES: CuratedCompany[] = [
  { slug: "google", name: "Google", domain: "google.com", aliases: ["Alphabet"], levels: ["L3", "L4", "L5", "L6", "L7"] },
  { slug: "meta", name: "Meta", domain: "meta.com", aliases: ["Facebook"], levels: ["E3", "E4", "E5", "E6", "E7"] },
  { slug: "amazon", name: "Amazon", domain: "amazon.com", aliases: ["AWS", "Amazon Web Services"], levels: ["SDE I", "SDE II", "SDE III", "Principal"] },
  { slug: "apple", name: "Apple", domain: "apple.com", levels: ["ICT2", "ICT3", "ICT4", "ICT5", "ICT6"] },
  { slug: "microsoft", name: "Microsoft", domain: "microsoft.com", aliases: ["MSFT"], levels: ["SDE (59-60)", "SDE II (61-62)", "Senior (63-64)", "Principal (65-67)"] },
  { slug: "netflix", name: "Netflix", domain: "netflix.com", levels: ["Senior", "Principal"] },
  { slug: "stripe", name: "Stripe", domain: "stripe.com", levels: ["L1", "L2", "L3", "L4", "L5"] },
  { slug: "uber", name: "Uber", domain: "uber.com", levels: ["3", "4", "5a", "5b", "6"] },
  { slug: "airbnb", name: "Airbnb", domain: "airbnb.com", levels: ["G7", "G8", "G9", "G10"] },
  { slug: "linkedin", name: "LinkedIn", domain: "linkedin.com", levels: ["Associate", "Senior", "Staff", "Senior Staff", "Principal"] },
  { slug: "salesforce", name: "Salesforce", domain: "salesforce.com", levels: ["Associate MTS", "MTS", "Senior MTS", "Lead MTS", "Principal MTS"] },
  { slug: "oracle", name: "Oracle", domain: "oracle.com", levels: ["IC1", "IC2", "IC3", "IC4", "IC5"] },
  { slug: "nvidia", name: "Nvidia", domain: "nvidia.com", levels: ["IC1", "IC2", "IC3", "IC4", "IC5", "IC6"] },
  { slug: "adobe", name: "Adobe", domain: "adobe.com", levels: ["Eng 2", "Eng 3", "Senior", "Principal"] },
  { slug: "atlassian", name: "Atlassian", domain: "atlassian.com", levels: ["P3", "P4", "P5", "P6"] },
  { slug: "shopify", name: "Shopify", domain: "shopify.com", levels: ["Junior", "Intermediate", "Senior", "Staff", "Principal"] },
  { slug: "coinbase", name: "Coinbase", domain: "coinbase.com", levels: ["IC3", "IC4", "IC5", "IC6"] },
  { slug: "databricks", name: "Databricks", domain: "databricks.com", levels: ["L3", "L4", "L5", "L6"] },
  { slug: "snowflake", name: "Snowflake", domain: "snowflake.com", levels: ["IC2", "IC3", "IC4", "IC5"] },
  { slug: "palantir", name: "Palantir", domain: "palantir.com", levels: ["New Grad", "Engineer", "Senior", "Lead"] },
  { slug: "dropbox", name: "Dropbox", domain: "dropbox.com", levels: ["IC1", "IC2", "IC3", "IC4"] },
  { slug: "pinterest", name: "Pinterest", domain: "pinterest.com", levels: ["Eng 1", "Eng 2", "Senior", "Staff"] },
  { slug: "block", name: "Block", domain: "block.xyz", aliases: ["Square", "Cash App"], levels: ["L3", "L4", "L5", "L6"] },
  { slug: "doordash", name: "DoorDash", domain: "doordash.com", levels: ["E3", "E4", "E5", "E6"] },
  { slug: "lyft", name: "Lyft", domain: "lyft.com", levels: ["T3", "T4", "T5", "T6"] },
  { slug: "robinhood", name: "Robinhood", domain: "robinhood.com", levels: ["IC3", "IC4", "IC5", "IC6"] },
  { slug: "reddit", name: "Reddit", domain: "reddit.com", levels: ["IC3", "IC4", "IC5", "IC6"] },
  { slug: "twilio", name: "Twilio", domain: "twilio.com", levels: ["TM3", "TM4", "TM5", "TM6"] },
  { slug: "roblox", name: "Roblox", domain: "roblox.com", levels: ["ICT2", "ICT3", "ICT4", "ICT5"] },
  { slug: "openai", name: "OpenAI", domain: "openai.com", levels: ["IC3", "IC4", "IC5", "IC6"] },
];

// ~20 canonical engineering roles. Slugs are stable (URL + reports FK), so
// don't rename them; widen `aliases` instead. NO inline create for roles
// (PLAN.md §Taxonomy curation) — this set is the closed world users match.
export const CURATED_ROLES: CuratedRole[] = [
  { slug: "swe", name: "Software Engineer", aliases: ["SDE", "Software Development Engineer", "Programmer", "Software Developer"] },
  { slug: "frontend", name: "Frontend Engineer", aliases: ["Front-End Engineer", "UI Engineer", "Web Developer"] },
  { slug: "backend", name: "Backend Engineer", aliases: ["Back-End Engineer", "Server Engineer"] },
  { slug: "fullstack", name: "Full-Stack Engineer", aliases: ["Full Stack Engineer"] },
  { slug: "mobile", name: "Mobile Engineer", aliases: ["iOS Engineer", "Android Engineer", "Mobile Developer"] },
  { slug: "ml", name: "Machine Learning Engineer", aliases: ["ML Engineer", "MLE"] },
  { slug: "ai-engineer", name: "AI Engineer", aliases: ["LLM Engineer", "GenAI Engineer", "Applied AI Engineer"] },
  { slug: "data-engineer", name: "Data Engineer", aliases: ["DE"] },
  { slug: "data-scientist", name: "Data Scientist", aliases: ["DS"] },
  { slug: "data-analyst", name: "Data Analyst", aliases: ["Analytics Engineer"] },
  { slug: "research-scientist", name: "Research Scientist", aliases: ["Researcher", "Research Engineer"] },
  { slug: "sre", name: "Site Reliability Engineer", aliases: ["SRE", "Reliability Engineer"] },
  { slug: "devops", name: "DevOps Engineer", aliases: ["Cloud Engineer"] },
  { slug: "platform", name: "Platform Engineer", aliases: ["Infrastructure Engineer", "Infra Engineer"] },
  { slug: "security", name: "Security Engineer", aliases: ["AppSec Engineer", "InfoSec Engineer", "Product Security Engineer"] },
  { slug: "embedded", name: "Embedded Engineer", aliases: ["Firmware Engineer", "Embedded Systems Engineer"] },
  { slug: "qa", name: "QA Engineer", aliases: ["Test Engineer", "SDET", "Quality Engineer"] },
  { slug: "tech-lead", name: "Tech Lead", aliases: ["Technical Lead", "TL", "Lead Engineer"] },
  { slug: "eng-manager", name: "Engineering Manager", aliases: ["EM", "Software Engineering Manager"] },
  { slug: "product-manager", name: "Product Manager", aliases: ["PM", "Technical Product Manager", "TPM"] },
];

export interface SeedCuratedResult {
  companies: number;
  roles: number;
  levels: number;
}

// Upsert the curated set. Returns counts (inserted-or-updated rows) so the
// seed entrypoint can log them and tests can assert on them.
export async function seedCurated(db: Db): Promise<SeedCuratedResult> {
  const companyRows = await db
    .insert(companies)
    .values(
      CURATED_COMPANIES.map((c) => ({
        slug: c.slug,
        name: c.name,
        domain: c.domain,
        aliases: c.aliases ?? [],
        status: "active" as const,
        source: "seed_curated" as const,
      })),
    )
    .onConflictDoUpdate({
      target: companies.slug,
      set: {
        name: sql`excluded.name`,
        domain: sql`excluded.domain`,
        aliases: sql`excluded.aliases`,
        status: sql`excluded.status`,
        source: sql`excluded.source`,
      },
    })
    .returning({ id: companies.id, slug: companies.slug });

  const idBySlug = new Map(companyRows.map((r) => [r.slug, r.id]));

  const levelValues = CURATED_COMPANIES.flatMap((c) => {
    const companyId = idBySlug.get(c.slug);
    if (!companyId) return [];
    return c.levels.map((name, orderIndex) => ({
      companyId,
      slug: slugify(name),
      name,
      orderIndex,
      status: "active" as const,
      source: "seed_curated" as const,
    }));
  });

  const levelRows = levelValues.length
    ? await db
        .insert(companyLevels)
        .values(levelValues)
        .onConflictDoUpdate({
          target: [companyLevels.companyId, companyLevels.slug],
          set: {
            name: sql`excluded.name`,
            orderIndex: sql`excluded.order_index`,
            status: sql`excluded.status`,
            source: sql`excluded.source`,
          },
        })
        .returning({ id: companyLevels.id })
    : [];

  const roleRows = await db
    .insert(roles)
    .values(
      CURATED_ROLES.map((r) => ({
        slug: r.slug,
        name: r.name,
        aliases: r.aliases ?? [],
        status: "active" as const,
        source: "seed_curated" as const,
      })),
    )
    .onConflictDoUpdate({
      target: roles.slug,
      set: {
        name: sql`excluded.name`,
        aliases: sql`excluded.aliases`,
        status: sql`excluded.status`,
        source: sql`excluded.source`,
      },
    })
    .returning({ id: roles.id });

  return {
    companies: companyRows.length,
    roles: roleRows.length,
    levels: levelRows.length,
  };
}
