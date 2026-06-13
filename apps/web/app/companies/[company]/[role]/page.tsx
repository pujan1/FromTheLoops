import { resolveCompanyRole } from "@fromtheloop/core";
import {
  getCompanyLevelBySlug,
  getDb,
  listLevelsForCompanyRoleWithReports,
} from "@fromtheloop/db";
import { parseReportFilters } from "@fromtheloop/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { Breadcrumb } from "@/components/breadcrumb";
import { RoleView } from "../../_components/role-view";
import styles from "../../browse.module.css";

type Params = Promise<{ company: string; role: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { company, role } = await params;
  const db = getDb();
  const resolved = await resolveCompanyRole(db, company, role);
  if (!resolved) return { title: "Not found — FromTheLoop" };

  const rolePath = routes.companyRole(resolved.company.slug, resolved.role.slug);
  // A ?level= variant canonicalizes to the level PATH (the path then decides
  // self-vs-role) — so the crawler indexes one address per filtered state. A
  // bogus level slug just canonicalizes to the role page.
  const filters = parseReportFilters(await searchParams);
  let canonical = rolePath;
  if (filters.level) {
    const lvl = await getCompanyLevelBySlug(db, resolved.company.id, filters.level);
    if (lvl) canonical = routes.wedge(resolved.company.slug, resolved.role.slug, lvl.slug);
  }

  return {
    title: `${resolved.role.name} at ${resolved.company.name} — FromTheLoop`,
    description: `Aggregated interview insights and reports for ${resolved.role.name} at ${resolved.company.name}, across every level.`,
    alternates: { canonical },
  };
}

// /companies/[company]/[role] — THE role page (the canonical aggregated unit in
// the role-primary model). Position Y = the role aggregate over every level;
// Position X = the filterable report list with a level facet. The level/page
// state lives in the URL (?level=&outcome=&page=…), fully SSR. The /[level] path
// renders the same body with the level pre-applied (see RoleView).
export default async function CompanyRolePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { company, role } = await params;
  const db = getDb();
  const resolved = await resolveCompanyRole(db, company, role);
  if (!resolved) notFound();

  const filters = parseReportFilters(await searchParams);
  const ladder = await listLevelsForCompanyRoleWithReports(
    db,
    resolved.company.id,
    resolved.role.id,
  );

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="wide">
          <Breadcrumb
            items={[
              { label: "Companies", href: routes.companies },
              {
                label: resolved.company.name,
                href: routes.company(resolved.company.slug),
              },
              { label: resolved.role.name },
            ]}
          />
          <FtlEyebrow tone="accent">interview reports</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {resolved.role.name} · {resolved.company.name}
          </FtlDisplay>
          <RoleView resolved={resolved} ladder={ladder} filters={filters} />
        </FtlContainer>
      </main>
    </>
  );
}
