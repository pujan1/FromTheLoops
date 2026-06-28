// Resolves browse-route slugs to taxonomy entities, null → 404. Each resolver
// composes the active-only db slug lookups and fails fast at the first miss.

import {
  type Database,
  getCompanyBySlug,
  getCompanyLevelBySlug,
  getRoleBySlug,
  getTopicBySlug,
  getUserByUsername,
  type TaxonomyRef,
  type User,
} from "@fromtheloop/db";

export interface ResolvedCompany {
  company: TaxonomyRef;
}

export interface ResolvedCompanyRole extends ResolvedCompany {
  role: TaxonomyRef;
}

export interface ResolvedWedge extends ResolvedCompanyRole {
  level: TaxonomyRef;
  // cell.level is the display name (matches interview_reports.level), not the slug.
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

// /u/:username — keyed on the public handle; the full User row rides along.
export interface ResolvedUser {
  user: User;
}

// /u/:username
export async function resolveUser(
  db: Database,
  username: string,
): Promise<ResolvedUser | null> {
  const user = await getUserByUsername(db, username);
  return user ? { user } : null;
}
