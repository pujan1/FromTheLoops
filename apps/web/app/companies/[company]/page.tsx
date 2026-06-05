import { resolveCompany } from "@fromtheloop/core";
import { getDb, listRolesForCompanyWithReports } from "@fromtheloop/db";
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
import { Breadcrumb } from "../_components/breadcrumb";
import styles from "../browse.module.css";

type Params = Promise<{ company: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { company } = await params;
  const resolved = await resolveCompany(getDb(), company);
  if (!resolved) return { title: "Not found — FromTheLoop" };
  return {
    title: `${resolved.company.name} interviews — FromTheLoop`,
    description: `Interview reports at ${resolved.company.name}, by role and level.`,
  };
}

// /companies/[company] — roles with ≥1 public report at this company.
export default async function CompanyPage({ params }: { params: Params }) {
  const { company } = await params;
  const db = getDb();
  const resolved = await resolveCompany(db, company);
  if (!resolved) notFound();

  const rolesList = await listRolesForCompanyWithReports(db, resolved.company.id);

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <Breadcrumb
            items={[
              { label: "Companies", href: routes.companies },
              { label: resolved.company.name },
            ]}
          />
          <FtlEyebrow tone="accent">company</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {resolved.company.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {rolesList.length > 0
              ? `Reports across ${rolesList.length} ${
                  rolesList.length === 1 ? "role" : "roles"
                }.`
              : "No published reports for this company yet."}
          </FtlBody>
          <FtlRule />

          {rolesList.length > 0 && (
            <ul className={styles.grid}>
              {rolesList.map((r) => (
                <li key={r.id}>
                  <Link
                    className={styles.tile}
                    href={routes.companyRole(resolved.company.slug, r.slug)}
                  >
                    <span className={styles.tile__name}>{r.name}</span>
                    <span className={styles.tile__meta}>
                      {r.reportCount} {r.reportCount === 1 ? "report" : "reports"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </FtlContainer>
      </main>
    </>
  );
}
