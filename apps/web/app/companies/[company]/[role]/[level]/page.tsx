import { resolveWedge } from "@fromtheloop/core";
import {
  getAggregate,
  getDb,
  listReportsForCell,
} from "@fromtheloop/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlReportCard,
  FtlRule,
  FtlSiteHeader,
  FtlStat,
  FtlStatGroup,
  FtlTag,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { Breadcrumb } from "../../../_components/breadcrumb";
import styles from "../../../browse.module.css";

type Params = Promise<{ company: string; role: string; level: string }>;

// First page only for Day 2; pagination + filters land in Days 4–5.
const PAGE_SIZE = 20;

const OUTCOME_LABEL: Record<string, string> = {
  offer: "Offer",
  reject: "Reject",
  withdrew: "Withdrew",
  ghosted: "Ghosted",
  pending: "Pending",
};

function humanizeRound(roundType: string): string {
  return roundType.replace(/-/g, " ");
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { company, role, level } = await params;
  const resolved = await resolveWedge(getDb(), company, role, level);
  if (!resolved) return { title: "Not found — FromTheLoop" };
  const title = `${resolved.company.name} · ${resolved.role.name} · ${resolved.level.name}`;
  return {
    title: `${title} interviews — FromTheLoop`,
    description: `Aggregated interview insights and reports for ${resolved.role.name} (${resolved.level.name}) at ${resolved.company.name}.`,
  };
}

// /companies/[company]/[role]/[level] — THE canonical wedge page. Day 2 renders
// the resolved cell with a basic aggregate summary (Position Y) + the first
// page of reports (Position X). The designed aggregate components + pagination
// + filters + sparse-data banner land in Days 3–7.
export default async function WedgePage({ params }: { params: Params }) {
  const { company, role, level } = await params;
  const db = getDb();
  const resolved = await resolveWedge(db, company, role, level);
  if (!resolved) notFound();

  const [aggregate, reportPage] = await Promise.all([
    getAggregate(db, resolved.cell),
    listReportsForCell(db, resolved.cell, { limit: PAGE_SIZE, offset: 0 }),
  ]);

  // Count comes from the aggregate when present, else the list window total.
  const reportCount = aggregate?.reportCount ?? reportPage.total;

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
            {resolved.company.name} · {resolved.role.name} ·{" "}
            {resolved.level.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {reportCount} {reportCount === 1 ? "report" : "reports"}
          </FtlBody>
          <FtlRule />

          {/* Position Y — aggregated insights. */}
          {aggregate && aggregate.reportCount > 0 ? (
            <section className={styles.section}>
              <FtlStatGroup>
                <FtlStat label="Reports" value={aggregate.reportCount} accent />
                <FtlStat label="Offers" value={aggregate.outcome.offer} />
                <FtlStat label="Rejects" value={aggregate.outcome.reject} />
                <FtlStat
                  label="Median rounds"
                  value={aggregate.medianRoundCount ?? "—"}
                />
                <FtlStat
                  label="Trust-weighted"
                  value={aggregate.trustWeightedCount.toFixed(1)}
                  hint={`of ${aggregate.reportCount}`}
                />
              </FtlStatGroup>

              {aggregate.modeRoundSequence &&
                aggregate.modeRoundSequence.length > 0 && (
                  <div className={styles.section}>
                    <p className={styles.sectionTitle}>Common round structure</p>
                    <div className={styles.sequence}>
                      {aggregate.modeRoundSequence.map((rt, i) => (
                        <span key={`${rt}-${i}`} style={{ display: "contents" }}>
                          {i > 0 && (
                            <span
                              className={styles.sequence__sep}
                              aria-hidden="true"
                            >
                              →
                            </span>
                          )}
                          <span>{humanizeRound(rt)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {aggregate.topTopics.length > 0 && (
                <div className={styles.section}>
                  <p className={styles.sectionTitle}>Top topics</p>
                  <div className={styles.sequence}>
                    {aggregate.topTopics.map((t) => (
                      <FtlTag key={t.slug} variant="ghost">
                        {t.name} ×{t.count}
                      </FtlTag>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <FtlBody tone="muted">
              Aggregated insights will appear here as reports are published.
            </FtlBody>
          )}

          {/* Position X — report list (first page; pagination in Day 4). */}
          {reportPage.items.length > 0 && (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>Reports</p>
              <div className={styles.reportList}>
                {reportPage.items.map((r, i) => (
                  <FtlReportCard
                    key={r.id}
                    index={String(i + 1).padStart(2, "0")}
                    company={resolved.company.name}
                    role={resolved.role.name}
                    level={r.level}
                    title={
                      r.outcome ? OUTCOME_LABEL[r.outcome] ?? r.outcome : "Outcome pending"
                    }
                    excerpt={`${r.authorName ?? "Anonymous"} · interviewed ${r.interviewMonth}`}
                    rounds={r.roundCount}
                    topics={[]}
                    verified={r.evidenceVerified}
                    postedAt={r.interviewMonth}
                    href={routes.report(r.id)}
                  />
                ))}
              </div>
              <p className={styles.listFoot}>
                Showing {reportPage.items.length} of {reportPage.total}
              </p>
            </section>
          )}
        </FtlContainer>
      </main>
    </>
  );
}
