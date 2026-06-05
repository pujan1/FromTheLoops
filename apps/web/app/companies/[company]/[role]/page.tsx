import { resolveCompanyRole } from "@fromtheloop/core";
import { getDb, listLevelsForCompanyRoleWithReports } from "@fromtheloop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { Breadcrumb } from "../../_components/breadcrumb";
import styles from "../../browse.module.css";

type Params = Promise<{ company: string; role: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { company, role } = await params;
  const resolved = await resolveCompanyRole(getDb(), company, role);
  if (!resolved) return { title: "Not found — FromTheLoop" };
  return {
    title: `${resolved.role.name} at ${resolved.company.name} — FromTheLoop`,
    description: `Interview reports for ${resolved.role.name} at ${resolved.company.name}, by level.`,
  };
}

// /companies/[company]/[role] — the level ladder for this (company, role).
// Each rung links to the canonical wedge page; a custom level with no
// company_levels slug renders without a link (no canonical URL exists for it).
export default async function CompanyRolePage({
  params,
}: {
  params: Params;
}) {
  const { company, role } = await params;
  const db = getDb();
  const resolved = await resolveCompanyRole(db, company, role);
  if (!resolved) notFound();

  const levels = await listLevelsForCompanyRoleWithReports(
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
              { label: resolved.role.name },
            ]}
          />
          <FtlEyebrow tone="accent">role</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {resolved.role.name} · {resolved.company.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {levels.length > 0
              ? "Pick a level to see aggregated insights and reports."
              : "No published reports for this role yet."}
          </FtlBody>
          <FtlRule />

          {levels.length > 0 && (
            <ul className={styles.levels}>
              {levels.map((lvl) => {
                const meta = `${lvl.reportCount} ${
                  lvl.reportCount === 1 ? "report" : "reports"
                }`;
                // Custom level (no company_levels slug) → no canonical URL.
                if (!lvl.slug) {
                  return (
                    <li
                      key={lvl.name}
                      className={`${styles.level} ${styles["level--nolink"]}`}
                    >
                      <span className={styles.level__name}>{lvl.name}</span>
                      <span className={styles.level__meta}>{meta}</span>
                    </li>
                  );
                }
                return (
                  <li key={lvl.name}>
                    <Link
                      className={styles.level}
                      href={routes.wedge(
                        resolved.company.slug,
                        resolved.role.slug,
                        lvl.slug,
                      )}
                    >
                      <span className={styles.level__name}>{lvl.name}</span>
                      <span className={styles.level__meta}>{meta}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </FtlContainer>
      </main>
    </>
  );
}
