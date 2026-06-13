import { karmaTier, resolveUser } from "@fromtheloop/core";
import {
  getDb,
  getUserProfileStats,
  listReportIdsForUser,
  listReportsForUser,
} from "@fromtheloop/db";
import { parseReportFilters } from "@fromtheloop/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FilterBar } from "@/components/reports";
import { ReportTriage } from "@/app/companies/_components/report-triage";
import { TRIAGE_ID_CAP } from "@/lib/triage";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlRule,
  FtlSiteHeader,
  FtlStatusBadge,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import styles from "./profile.module.css";

type Params = Promise<{ username: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The author's public-facing name: their chosen display name, or the @handle as
// a fallback for accounts that never set one. Reused by the heading and the
// metadata title so they never drift.
function authorName(displayName: string | null, username: string): string {
  return displayName ?? `@${username}`;
}

// "June 2024" — the account's join month. Day-grain would be noise on a public
// profile; month is enough to read as "an established contributor."
const MEMBER_SINCE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { username } = await params;
  const resolved = await resolveUser(getDb(), username);
  if (!resolved) return { title: "Not found — FromTheLoop" };
  const name = authorName(resolved.user.displayName, username);
  return {
    title: `${name} (@${username}) — FromTheLoop`,
    description: `Interview reports ${name} has shared publicly on FromTheLoop.`,
    alternates: { canonical: routes.user(username) },
  };
}

// /u/[username] — a contributor's public profile. Shows their display name,
// badges, and the reports they chose to ATTRIBUTE. Reports posted anonymously
// never appear here (listReportsForUser filters on display_attribution): karma
// is account-bound, but visibility is per-report, so an anonymous submission
// stays anonymous everywhere public — yet its karma still counts toward the
// account-wide total shown here (PLAN.md §Anonymity). The karma figure (Sprint 5
// Day 7) reads straight off the user row, kept current by the recompute-karma
// worker; the 10/100/1000 tier badge (Day 8) is derived from it via karmaTier.
// Fully SSR.
export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { username } = await params;
  const db = getDb();
  const resolved = await resolveUser(db, username);
  if (!resolved) notFound();

  const { user } = resolved;
  const filters = parseReportFilters(await searchParams);
  const basePath = routes.user(username);

  const feedFilters = { outcome: filters.outcome };
  const [stats, feed, orderedIds] = await Promise.all([
    getUserProfileStats(db, user.id),
    listReportsForUser(db, user.id, {
      limit: filters.perPage,
      offset: (filters.page - 1) * filters.perPage,
      filters: feedFilters,
    }),
    // Ordered IDs for the triage pane/sheet — the SAME attributed set the feed
    // paginates (anonymous reports excluded by the provider's privacy predicate).
    listReportIdsForUser(db, user.id, {
      filters: feedFilters,
      cap: TRIAGE_ID_CAP,
    }),
  ]);

  const name = authorName(user.displayName, username);
  const startIndex = (filters.page - 1) * filters.perPage;
  const isVerified = stats.verifiedAtCompanyCount > 0;
  // The 10/100/1000 vanity rung, if reached (Day 8).
  const tier = karmaTier(user.karma);

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="wide">
          <FtlEyebrow tone="accent">profile</FtlEyebrow>
          <FtlDisplay as="h1" size="xl" style={{ marginTop: 24 }}>
            {name}
          </FtlDisplay>
          <p className={styles.handle}>@{username}</p>

          <div className={styles.badges}>
            {isVerified && (
              <FtlStatusBadge status="success">
                Verified contributor
              </FtlStatusBadge>
            )}
            <FtlStatusBadge status="info" dot={false}>
              {user.karma.toLocaleString()} karma
            </FtlStatusBadge>
            {tier && (
              <FtlStatusBadge status="success" dot={false}>
                {tier.label}
              </FtlStatusBadge>
            )}
            <FtlStatusBadge status="neutral" dot={false}>
              {stats.publicReportCount}{" "}
              {stats.publicReportCount === 1 ? "public report" : "public reports"}
            </FtlStatusBadge>
            <FtlStatusBadge status="neutral" dot={false}>
              Member since {MEMBER_SINCE.format(user.createdAt)}
            </FtlStatusBadge>
          </div>

          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {stats.publicReportCount > 0
              ? "Interview reports this contributor has shared publicly."
              : "This contributor hasn’t shared any public reports yet. Reports posted anonymously don’t appear here."}
          </FtlBody>

          <FtlRule />

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Public reports</h2>
            <FilterBar
              basePath={basePath}
              filters={filters}
              showRound={false}
              showTrust={false}
            />
            {/* Master-detail triage (ADR-0010): cross-company feed, so no
                constant companyName — each row carries its own. Desktop pane /
                mobile sheet; the per-report SSR page stays canonical. */}
            <ReportTriage
              items={feed.items}
              orderedIds={orderedIds}
              startIndex={startIndex}
              basePath={basePath}
              filters={filters}
              total={feed.total}
              emptyMessage="No public reports match these filters."
            />
          </section>
        </FtlContainer>
      </main>
    </>
  );
}
