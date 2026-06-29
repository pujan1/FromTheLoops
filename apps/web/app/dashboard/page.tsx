import { currentUser } from "@clerk/nextjs/server";
import {
  EDIT_WINDOW_MS,
  getDb,
  getOrCreateUserByClerkId,
  isReportEditable,
  listDrafts,
  listOwnReports,
  type OwnReportListItem,
} from "@fromtheloop/db";
import { submissionDraftSchema } from "@fromtheloop/shared";
import type { Metadata } from "next";
import Link from "next/link";
import {
  FtlBody,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlLinkButton,
  FtlRule,
  FtlSiteHeader,
  FtlStatusBadge,
} from "@/components/ui";
import { levelLabel, outcomeLabel } from "@/lib/labels";
import { routes } from "@/lib/routes";
import { getImpersonation } from "@/lib/view-as";
import { DiscardDraftButton } from "./discard-draft-button";
import styles from "./dashboard.module.css";

export const metadata: Metadata = {
  title: "Your dashboard — FromTheLoop",
  // Private surface; keep it out of search results.
  robots: { index: false, follow: false },
};

// "2 days ago" / "3 hours ago" — coarse relative time for the draft "last
// edited" line. Server-rendered against the request clock; minute-grain is
// enough for a resume list.
const RELATIVE = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
function relativeFromNow(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 60) return RELATIVE.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
  return RELATIVE.format(Math.round(hours / 24), "day");
}

// A human label for a draft from its (tolerant) jsonb data. A brand-new draft
// with no company yet reads as "Untitled draft" rather than an empty string.
function draftLabel(data: unknown): string {
  const parsed = submissionDraftSchema.safeParse(data);
  if (!parsed.success) return "Untitled draft";
  const { company, role, level } = parsed.data;
  const parts = [company?.name, role?.name, level?.name].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(" · ") : "Untitled draft";
}

// The owner-facing moderation-status badge. pending_moderation reads as
// "Pending review" (the report is submitted but not yet publicly visible);
// rejected reads as "Not approved" (a moderator declined a held submission);
// active reads as "Published". (Deleted rows are filtered out upstream.)
function statusBadge(status: OwnReportListItem["status"]) {
  if (status === "pending_moderation") {
    return <FtlStatusBadge status="pending">Pending review</FtlStatusBadge>;
  }
  if (status === "rejected") {
    return <FtlStatusBadge status="danger">Not approved</FtlStatusBadge>;
  }
  return <FtlStatusBadge status="success">Published</FtlStatusBadge>;
}

// /dashboard — the private, signed-in home for a contributor's own work:
// in-progress drafts (continue / discard) and submitted reports with their
// moderation + edit-window status. Middleware gates the route, so currentUser()
// is non-null here. Not indexable (see metadata). Fully SSR.
export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) {
    // Belt-and-suspenders: middleware should have redirected. Surface loudly
    // rather than rendering a broken page.
    throw new Error(
      "dashboard: middleware did not gate unauthenticated request",
    );
  }

  const db = getDb();
  // "View as user" (Sprint 6 Day 9): an admin impersonating reads the TARGET's
  // owner surface, not their own. getImpersonation is admin-gated, so a non-admin
  // can never reach this branch. All of this is read-only — the dashboard renders
  // no actions that mutate as the target (and middleware blocks the write routes).
  const impersonation = await getImpersonation(db);
  const owner = impersonation
    ? { id: impersonation.targetUserId }
    : // Upsert-on-visit: guarantees a `users` row for the Clerk principal so the
      // ownership-scoped reads below resolve. Webhook sync is still deferred.
      await getOrCreateUserByClerkId(db, {
        clerkId: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? null,
      });

  const [drafts, reports] = await Promise.all([
    listDrafts(db, owner.id),
    listOwnReports(db, owner.id),
  ]);

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          <FtlEyebrow tone="accent">dashboard</FtlEyebrow>
          <FtlDisplay as="h1" size="lg" style={{ marginTop: 24 }}>
            {impersonation
              ? `${impersonation.displayName ?? (impersonation.username ? `@${impersonation.username}` : "User")}’s work`
              : "Your work"}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {impersonation
              ? "Read-only view of this contributor’s drafts and submitted reports. Exit “view as” from the banner to return to your own dashboard."
              : "Pick up an in-progress draft, or review the experiences you’ve submitted."}
          </FtlBody>

          <FtlRule />

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Drafts</h2>
              {!impersonation && (
                <FtlLinkButton href={routes.submit} variant="ghost" size="sm">
                  Start a new report
                </FtlLinkButton>
              )}
            </div>

            {drafts.length === 0 ? (
              <p className={styles.empty}>
                No drafts in progress. Start a report and it’ll autosave here.
              </p>
            ) : (
              <ul className={styles.list}>
                {drafts.map((draft) => (
                  <li key={draft.id} className={styles.row}>
                    <div className={styles.row__main}>
                      <span className={styles.row__title}>
                        {draftLabel(draft.data)}
                      </span>
                      <span className={styles.row__meta}>
                        Last edited {relativeFromNow(draft.updatedAt)}
                      </span>
                    </div>
                    {/* Owner-only write affordances — hidden in read-only
                        "view as" mode (the draft routes are also middleware-gated). */}
                    {!impersonation && (
                      <div className={styles.row__actions}>
                        <FtlLinkButton
                          href={routes.draft(draft.id)}
                          variant="primary"
                          size="sm"
                          trailingArrow
                        >
                          Continue
                        </FtlLinkButton>
                        <DiscardDraftButton
                          draftId={draft.id}
                          label="Discard"
                          confirmText="Discard this draft? This can’t be undone."
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <FtlRule />

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your reports</h2>

            {reports.length === 0 ? (
              <p className={styles.empty}>
                You haven’t submitted any reports yet.
              </p>
            ) : (
              <ul className={styles.list}>
                {reports.map((report) => {
                  const editable = isReportEditable(report);
                  // Whole hours left, rounded up so "0 hours" never shows while
                  // still editable; bounded by the window as a clock-skew guard.
                  const msLeft = Math.min(
                    EDIT_WINDOW_MS,
                    report.lockedAt.getTime() - Date.now(),
                  );
                  const hoursLeft = Math.max(
                    1,
                    Math.ceil(msLeft / (60 * 60 * 1000)),
                  );
                  return (
                    <li key={report.id} className={styles.row}>
                      <div className={styles.row__main}>
                        <Link
                          href={routes.report(report.id)}
                          className={styles.row__title}
                        >
                          {report.companyName} · {report.roleName} ·{" "}
                          {levelLabel(report.level)}
                        </Link>
                        <span className={styles.row__meta}>
                          {outcomeLabel(report.outcome)} · interviewed{" "}
                          {report.interviewMonth}
                          {report.displayAttribution === "anonymous"
                            ? " · posted anonymously"
                            : ""}
                        </span>
                      </div>
                      <div className={styles.row__status}>
                        {statusBadge(report.status)}
                        {editable ? (
                          <span className={styles.row__edit}>
                            Editable for {hoursLeft}h
                          </span>
                        ) : (
                          <span className={styles.row__locked}>Locked</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </FtlContainer>
      </main>
    </>
  );
}
