import { currentUser } from "@clerk/nextjs/server";
import {
  countHelpfulFlags,
  EDIT_WINDOW_MS,
  getDb,
  getOrCreateUserByClerkId,
  getPublicReportDetail,
  getReportForEdit,
  getUserById,
  hasUserFlaggedReport,
  isReportEditable,
  type ReportDetail,
  toReportDetailView,
  userIsVerified,
} from "@fromtheloop/db";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  FtlBody,
  FtlButton,
  FtlContainer,
  FtlNotice,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { startReportEdit } from "./actions";
import { DeleteReportButton } from "./delete-report-button";
import { HelpfulFlagButton } from "./helpful-flag-button";
import { ReportDetailBody } from "./report-detail-body";
import styles from "./reports.module.css";

// A single interview report.
//
// Two audiences, one page:
//   - Public: any visitor can read an `active` report (the Sprint 4 public
//     detail page — SSR, indexable, shows the full rounds→questions→topics
//     tree). getPublicReportDetail enforces the same visibility filter as every
//     other public surface.
//   - Owner: the author can additionally view their own report in ANY status
//     (this doubles as the post-submit landing for a still-`pending_moderation`
//     report) and gets the 24h edit / soft-delete controls.
//
// Resolution: try the public read first; if the report isn't public, fall back
// to the ownership-scoped read for a signed-in author. A guessed/foreign id, or
// a non-public report viewed by a non-owner, 404s.
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  // Resolve the viewer's internal id if signed in (drives ownership + controls).
  const user = await currentUser();
  let viewerId: string | null = null;
  if (user) {
    const internal = await getOrCreateUserByClerkId(db, {
      clerkId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
    });
    viewerId = internal.id;
  }

  let detail: ReportDetail | null = await getPublicReportDetail(db, id);
  if (!detail) {
    // Not public — only the signed-in author may view their own report.
    if (!viewerId) notFound();
    detail = await getReportForEdit(db, id, viewerId);
    if (!detail) notFound();
  }

  const viewerIsAuthor =
    viewerId !== null && detail.report.createdByUserId === viewerId;

  const t = await getTranslations("report");

  const isDeleted = detail.report.status === "deleted";
  const editable = viewerIsAuthor && isReportEditable(detail.report);
  // Whole hours left in the window, rounded up so "0 hours" never shows while
  // still editable. Bounded by the window size as a guard against clock skew.
  const msLeft = Math.min(
    EDIT_WINDOW_MS,
    detail.report.lockedAt.getTime() - Date.now(),
  );
  const hoursLeft = Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));

  // Attribution line: a display_name report shows the author's name; anonymous
  // reports stay anonymous. (One extra lookup, only when attributed.)
  let attribution = t("detail.anonymous");
  if (detail.displayAttribution === "display_name") {
    const author = await getUserById(db, detail.report.createdByUserId);
    const name = author?.displayName ?? author?.username;
    if (name) attribution = t("detail.by", { name });
  }

  // Helpful-flag state (Day 8). Only meaningful on a public (active) report —
  // not a pending/own-only or deleted one. The count is public; the interactive
  // control needs a signed-in, verified, non-author viewer. An author, or an
  // unverified/signed-out reader, sees the count with a hint instead.
  const showHelpful = !isDeleted && detail.report.status === "active";
  let helpfulCount = 0;
  let viewerFlagged = false;
  let canFlag = false;
  let flagReason: "signIn" | "verify" | "author" | undefined;
  if (showHelpful) {
    helpfulCount = await countHelpfulFlags(db, detail.report.id);
    if (!viewerId) {
      flagReason = "signIn";
    } else if (viewerIsAuthor) {
      flagReason = "author";
    } else {
      viewerFlagged = await hasUserFlaggedReport(db, detail.report.id, viewerId);
      // Already-flagged readers can always un-flag; otherwise verified-only.
      canFlag = viewerFlagged || (await userIsVerified(db, viewerId));
      if (!canFlag) flagReason = "verify";
    }
  }

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          {/* Title · summary · rounds tree — the single shared rendering, also
              used by the client triage pane (ADR-0010). Viewer-specific eyebrow
              and byline are resolved here and passed in; the owner of a deleted
              report sees the summary but not the rounds (hideRounds). */}
          <ReportDetailBody
            detail={toReportDetailView(detail)}
            eyebrow={viewerIsAuthor ? t("eyebrow") : t("detail.publicEyebrow")}
            byline={
              viewerIsAuthor ? t(`status.${detail.report.status}`) : attribution
            }
            hideRounds={isDeleted}
          />

          {/* Helpful-flag: count + (for an eligible viewer) the toggle. Public
              readers see the count and a hint to sign in / verify. */}
          {showHelpful && (
            <>
              <FtlRule />
              <HelpfulFlagButton
                reportId={detail.report.id}
                initialFlagged={viewerFlagged}
                initialCount={helpfulCount}
                canFlag={canFlag}
                reason={flagReason}
              />
            </>
          )}

          {/* Owner controls: edit (within 24h) + soft-delete. Only the author
              sees these. */}
          {viewerIsAuthor && (
            <>
              <FtlRule />
              {isDeleted ? (
                <FtlNotice tone="info" title={t("delete.doneTitle")}>
                  {t("delete.done")}
                </FtlNotice>
              ) : (
                <div className={styles.editBlock}>
                  {editable ? (
                    <>
                      <FtlBody tone="muted">
                        {t("edit.window", { hours: hoursLeft })}
                      </FtlBody>
                      <div className={styles.actions}>
                        <form action={startReportEdit}>
                          <input
                            type="hidden"
                            name="reportId"
                            value={detail.report.id}
                          />
                          <FtlButton type="submit" variant="primary" trailingArrow>
                            {t("edit.cta")}
                          </FtlButton>
                        </form>
                        <DeleteReportButton
                          reportId={detail.report.id}
                          label={t("delete.cta")}
                          confirmText={t("delete.confirm")}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <FtlNotice tone="info" title={t("edit.lockedTitle")}>
                        {t("edit.locked")}
                      </FtlNotice>
                      <div className={styles.actions}>
                        <DeleteReportButton
                          reportId={detail.report.id}
                          label={t("delete.cta")}
                          confirmText={t("delete.confirm")}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </FtlContainer>
      </main>
    </>
  );
}
