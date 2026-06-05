import { getDb, listCompaniesWithReports } from "@fromtheloop/db";
import type { Metadata } from "next";
import Link from "next/link";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import styles from "./browse.module.css";

export const metadata: Metadata = {
  title: "Companies — FromTheLoop",
  description:
    "Browse structured interview reports by company, role, and level.",
};

// /companies — the browse index. Lists every company with ≥1 public report,
// busiest first. SSR off a single grouped read (no client fetch).
export default async function CompaniesPage() {
  const db = getDb();
  const companies = await listCompaniesWithReports(db);

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer>
          <FtlEyebrow tone="accent">companies</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            Browse companies
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {companies.length > 0
              ? `Interview reports across ${companies.length} ${
                  companies.length === 1 ? "company" : "companies"
                }.`
              : "Interview reports will appear here as they're published."}
          </FtlBody>
          <FtlRule />

          {companies.length === 0 ? (
            <FtlBody tone="muted">No published reports yet.</FtlBody>
          ) : (
            <ul className={styles.grid}>
              {companies.map((c) => (
                <li key={c.id}>
                  <Link className={styles.tile} href={routes.company(c.slug)}>
                    <span className={styles.tile__name}>{c.name}</span>
                    <span className={styles.tile__meta}>
                      {c.reportCount} {c.reportCount === 1 ? "report" : "reports"}
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
