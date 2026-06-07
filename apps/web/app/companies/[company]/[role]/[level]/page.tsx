import { decideLevelView, resolveWedge } from "@fromtheloop/core";
import {
  getAggregate,
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
import { RoleView } from "../../../_components/role-view";
import styles from "../../../browse.module.css";

type Params = Promise<{ company: string; role: string; level: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { company, role, level } = await params;
  const db = getDb();
  const resolved = await resolveWedge(db, company, role, level);
  if (!resolved) return { title: "Not found — FromTheLoop" };

  const rolePath = routes.companyRole(resolved.company.slug, resolved.role.slug);
  const levelPath = routes.wedge(
    resolved.company.slug,
    resolved.role.slug,
    resolved.level.slug,
  );
  // A level page self-canonicalizes only when its cell is dense enough to stand
  // on its own; a thin level near-duplicates the role page, so it canonicalizes
  // UP to the role page rather than competing for index space.
  const levelCell = await getAggregate(db, resolved.cell);
  const dense = decideLevelView(levelCell?.reportCount ?? 0).view === "level";

  const title = `${resolved.role.name} · ${resolved.level.name} at ${resolved.company.name}`;
  return {
    title: `${title} interviews — FromTheLoop`,
    description: `Aggregated interview insights and reports for ${resolved.role.name} (${resolved.level.name}) at ${resolved.company.name}.`,
    alternates: { canonical: dense ? levelPath : rolePath },
  };
}

// /companies/[company]/[role]/[level] — a per-level VIEW of the role page. It
// renders the exact same RoleView body with the level pre-applied (injected into
// filters.level from the path), so Position Y shows the level cell when dense
// and falls back to the role aggregate + sparse banner when thin. A bad level
// slug 404s (the path is strict; the ?level= query form is tolerant).
export default async function WedgePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { company, role, level } = await params;
  const db = getDb();
  const resolved = await resolveWedge(db, company, role, level);
  if (!resolved) notFound();

  // Inject the path level into the filter state — from here the page IS the role
  // page with ?level= pre-applied.
  const filters = {
    ...parseReportFilters(await searchParams),
    level: resolved.level.slug,
  };
  const ladder = await listLevelsForCompanyRoleWithReports(
    db,
    resolved.company.id,
    resolved.role.id,
  );

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <Breadcrumb
            items={[
              { label: "Companies", href: routes.companies },
              {
                label: resolved.company.name,
                href: routes.company(resolved.company.slug),
              },
              {
                label: resolved.role.name,
                href: routes.companyRole(
                  resolved.company.slug,
                  resolved.role.slug,
                ),
              },
              { label: resolved.level.name },
            ]}
          />
          <FtlEyebrow tone="accent">interview reports</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {resolved.role.name} · {resolved.company.name} · {resolved.level.name}
          </FtlDisplay>
          <RoleView
            resolved={{ company: resolved.company, role: resolved.role }}
            ladder={ladder}
            filters={filters}
          />
        </FtlContainer>
      </main>
    </>
  );
}
