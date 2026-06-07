// The canonical URL resolver: turns the URL segments of a browse route into the
// real taxonomy entities (or a null "not found" signal the route turns into a
// 404). All four /companies/* routes call through these, so the slug→entity
// contract lives in one place (per Sprint 4's routing-complexity mitigation /
// the URL-contract ADR).
//
// Each resolver composes the db slug lookups (getCompanyBySlug / getRoleBySlug /
// getCompanyLevelBySlug — all active-only) and threads the parent's id into the
// next lookup, so resolution fails fast at the first missing segment. The wedge
// resolver also returns the AggregateCellKey the page needs to read the
// aggregate + the report list (keyed on the level's display `name`, which is
// what interview_reports.level and the aggregate table store — NOT the slug).

import {
  type Database,
  getCompanyBySlug,
  getCompanyLevelBySlug,
  getRoleBySlug,
  getTopicBySlug,
  type TaxonomyRef,
} from "@fromtheloop/db";

export interface ResolvedCompany {
  company: TaxonomyRef;
}

export interface ResolvedCompanyRole extends ResolvedCompany {
  role: TaxonomyRef;
}

export interface ResolvedWedge extends ResolvedCompanyRole {
  level: TaxonomyRef;
  // The aggregate / report-list cell key. `level` is the display name, matching
  // interview_reports.level + aggregates_company_role_level.level.
  cell: { companyId: string; canonicalRoleId: string; level: string };
}

// /companies/:company
export async function resolveCompany(
  db: Database,
  companySlug: string,
): Promise<ResolvedCompany | null> {
  const company = await getCompanyBySlug(db, companySlug);
  return company ? { company } : null;
}

// /companies/:company/:role
export async function resolveCompanyRole(
  db: Database,
  companySlug: string,
  roleSlug: string,
): Promise<ResolvedCompanyRole | null> {
  const company = await getCompanyBySlug(db, companySlug);
  if (!company) return null;
  const role = await getRoleBySlug(db, roleSlug);
  if (!role) return null;
  return { company, role };
}

// /companies/:company/:role/:level — the canonical wedge page.
export async function resolveWedge(
  db: Database,
  companySlug: string,
  roleSlug: string,
  levelSlug: string,
): Promise<ResolvedWedge | null> {
  const company = await getCompanyBySlug(db, companySlug);
  if (!company) return null;
  const role = await getRoleBySlug(db, roleSlug);
  if (!role) return null;
  const level = await getCompanyLevelBySlug(db, company.id, levelSlug);
  if (!level) return null;
  return {
    company,
    role,
    level,
    cell: {
      companyId: company.id,
      canonicalRoleId: role.id,
      level: level.name,
    },
  };
}

// ---------------------------------------------------------------------------
// Topic browse resolvers (Sprint 5) — the second discovery axis. Same
// composition pattern: resolve each slug to an active taxonomy row, failing
// fast (null → 404) at the first miss.
// ---------------------------------------------------------------------------

export interface ResolvedTopic {
  topic: TaxonomyRef;
}

export interface ResolvedTopicCompany extends ResolvedTopic {
  company: TaxonomyRef;
}

// /topics/:topic
export async function resolveTopic(
  db: Database,
  topicSlug: string,
): Promise<ResolvedTopic | null> {
  const topic = await getTopicBySlug(db, topicSlug);
  return topic ? { topic } : null;
}

// /topics/:topic/:company
export async function resolveTopicCompany(
  db: Database,
  topicSlug: string,
  companySlug: string,
): Promise<ResolvedTopicCompany | null> {
  const topic = await getTopicBySlug(db, topicSlug);
  if (!topic) return null;
  const company = await getCompanyBySlug(db, companySlug);
  if (!company) return null;
  return { topic, company };
}
