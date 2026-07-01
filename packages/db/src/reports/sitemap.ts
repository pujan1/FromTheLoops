import { sql } from "drizzle-orm";
import type { Db } from "../lib/types.js";

// Mirrors core's SPARSE_REPORT_THRESHOLD; a local literal because db can't depend
// on core — keep in sync if that threshold moves.
const DENSE_CELL_THRESHOLD = 10;

export interface SitemapCompany {
  slug: string;
  lastMod: Date;
}
export interface SitemapRole {
  companySlug: string;
  roleSlug: string;
  lastMod: Date;
}
export interface SitemapLevel {
  companySlug: string;
  roleSlug: string;
  levelSlug: string;
  lastMod: Date;
}
export interface SitemapTopic {
  slug: string;
  lastMod: Date;
}
export interface SitemapTopicCompany {
  topicSlug: string;
  companySlug: string;
  lastMod: Date;
}

export interface SitemapEntries {
  companies: SitemapCompany[];
  roles: SitemapRole[];
  levels: SitemapLevel[];
  topics: SitemapTopic[];
  topicCompanies: SitemapTopicCompany[];
}

export async function getSitemapEntries(db: Db): Promise<SitemapEntries> {
  const [companies, roles, levels, topics, topicCompanies] = await Promise.all([
    companyEntries(db),
    roleEntries(db),
    levelEntries(db),
    topicEntries(db),
    topicCompanyEntries(db),
  ]);
  return { companies, roles, levels, topics, topicCompanies };
}

async function companyEntries(db: Db): Promise<SitemapCompany[]> {
  const rows = await db.execute<{ slug: string; last_mod: string }>(sql`
    SELECT c.slug, MAX(r.created_at) AS last_mod
    FROM companies c
    JOIN interview_reports r
      ON r.company_id = c.id
     AND r.status = 'active'
     AND r.deleted_at IS NULL
    WHERE c.status = 'active'
    GROUP BY c.slug
    HAVING COUNT(r.id) > 0
    ORDER BY c.slug ASC
  `);
  return rows.map((r) => ({ slug: r.slug, lastMod: new Date(r.last_mod) }));
}

async function roleEntries(db: Db): Promise<SitemapRole[]> {
  const rows = await db.execute<{
    company_slug: string;
    role_slug: string;
    last_mod: string;
  }>(sql`
    SELECT c.slug AS company_slug, ro.slug AS role_slug,
           MAX(r.created_at) AS last_mod
    FROM interview_reports r
    JOIN companies c ON c.id = r.company_id AND c.status = 'active'
    JOIN roles ro ON ro.id = r.canonical_role_id AND ro.status = 'active'
    WHERE r.status = 'active' AND r.deleted_at IS NULL
    GROUP BY c.slug, ro.slug
    ORDER BY c.slug ASC, ro.slug ASC
  `);
  return rows.map((r) => ({
    companySlug: r.company_slug,
    roleSlug: r.role_slug,
    lastMod: new Date(r.last_mod),
  }));
}

async function levelEntries(db: Db): Promise<SitemapLevel[]> {
  // Dense cells only; thin cells canonicalize up and are omitted.
  const rows = await db.execute<{
    company_slug: string;
    role_slug: string;
    level_slug: string;
    last_mod: string;
  }>(sql`
    SELECT c.slug AS company_slug, ro.slug AS role_slug, cl.slug AS level_slug,
           MAX(r.created_at) AS last_mod
    FROM interview_reports r
    JOIN companies c ON c.id = r.company_id AND c.status = 'active'
    JOIN roles ro ON ro.id = r.canonical_role_id AND ro.status = 'active'
    JOIN company_levels cl
      ON cl.company_id = r.company_id
     AND cl.name = r.level
     AND cl.status = 'active'
    WHERE r.status = 'active' AND r.deleted_at IS NULL
    GROUP BY c.slug, ro.slug, cl.slug
    HAVING COUNT(r.id) >= ${DENSE_CELL_THRESHOLD}
    ORDER BY c.slug ASC, ro.slug ASC, cl.slug ASC
  `);
  return rows.map((r) => ({
    companySlug: r.company_slug,
    roleSlug: r.role_slug,
    levelSlug: r.level_slug,
    lastMod: new Date(r.last_mod),
  }));
}

async function topicEntries(db: Db): Promise<SitemapTopic[]> {
  const rows = await db.execute<{ slug: string; last_mod: string }>(sql`
    SELECT t.slug, MAX(r.created_at) AS last_mod
    FROM topics t
    JOIN question_topics qt ON qt.topic_id = t.id
    JOIN questions q ON q.id = qt.question_id
    JOIN rounds rd ON rd.id = q.round_id
    JOIN interview_reports r
      ON r.id = rd.report_id
     AND r.status = 'active'
     AND r.deleted_at IS NULL
    WHERE t.status = 'active'
    GROUP BY t.slug
    HAVING COUNT(DISTINCT r.id) > 0
    ORDER BY t.slug ASC
  `);
  return rows.map((r) => ({ slug: r.slug, lastMod: new Date(r.last_mod) }));
}

async function topicCompanyEntries(db: Db): Promise<SitemapTopicCompany[]> {
  // Dense leaves only; thin ones canonicalize up to the topic page.
  const rows = await db.execute<{
    topic_slug: string;
    company_slug: string;
    last_mod: string;
  }>(sql`
    SELECT t.slug AS topic_slug, c.slug AS company_slug,
           MAX(r.created_at) AS last_mod
    FROM topics t
    JOIN question_topics qt ON qt.topic_id = t.id
    JOIN questions q ON q.id = qt.question_id
    JOIN rounds rd ON rd.id = q.round_id
    JOIN interview_reports r
      ON r.id = rd.report_id
     AND r.status = 'active'
     AND r.deleted_at IS NULL
    JOIN companies c ON c.id = r.company_id AND c.status = 'active'
    WHERE t.status = 'active'
    GROUP BY t.slug, c.slug
    HAVING COUNT(DISTINCT r.id) >= ${DENSE_CELL_THRESHOLD}
    ORDER BY t.slug ASC, c.slug ASC
  `);
  return rows.map((r) => ({
    topicSlug: r.topic_slug,
    companySlug: r.company_slug,
    lastMod: new Date(r.last_mod),
  }));
}
