import { currentUser } from "@clerk/nextjs/server";
import {
  EDIT_WINDOW_MS,
  getDb,
  getOrCreateUserByClerkId,
  getPublicReportDetail,
  getReportForEdit,
  getUserById,
  isReportEditable,
  type ReportDetail,
} from "@fromtheloop/db";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  FtlBody,
  FtlButton,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlNotice,
  FtlRule,
  FtlSiteHeader,
  FtlTag,
} from "@/components/ui";
import { startReportEdit } from "./actions";
import { DeleteReportButton } from "./delete-report-button";
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
  const tRounds = await getTranslations("rounds");
  const tOutcome = await getTranslations("submit");

  const isDeleted = detail.report.status === "deleted";
  const editable = viewerIsAuthor && isReportEditable(detail.report);
  const roundCount = detail.rounds.length;
  const questionCount = detail.rounds.reduce(
    (sum, r) => sum + r.questions.length,
    0,
  );
  // Whole hours left in the window, rounded up so "0 hours" never shows while
  // still editable. Bounded by the window size as a guard against clock skew.
  const msLeft = Math.min(
    EDIT_WINDOW_MS,
    detail.report.lockedAt.getTime() - Date.now(),
  );
  const hoursLeft = Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));
  const outcomeLabel = detail.report.outcome
    ? tOutcome(`outcome.${detail.report.outcome}`)
    : t("outcome.none");

  // Attribution line: a display_name report shows the author's name; anonymous
  // reports stay anonymous. (One extra lookup, only when attributed.)
  let attribution = t("detail.anonymous");
  if (detail.displayAttribution === "display_name") {
    const author = await getUserById(db, detail.report.createdByUserId);
    const name = author?.displayName ?? author?.username;
    if (name) attribution = t("detail.by", { name });
  }

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          <FtlEyebrow tone="accent">
            {viewerIsAuthor ? t("eyebrow") : t("detail.publicEyebrow")}
          </FtlEyebrow>
          <FtlDisplay as="h1" size="lg" style={{ marginTop: 24 }}>
            {detail.company.name} · {detail.role.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {viewerIsAuthor ? t(`status.${detail.report.status}`) : attribution}
          </FtlBody>
          <FtlRule />

          <dl className={styles.summary}>
            <div className={styles.row}>
              <dt>{t("summary.level")}</dt>
              <dd>{detail.level.name}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t("summary.month")}</dt>
              <dd>{detail.interviewMonth}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t("summary.outcome")}</dt>
              <dd>{outcomeLabel}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t("summary.detail")}</dt>
              <dd>
                {t("summary.rounds", { count: roundCount })} ·{" "}
                {t("summary.questions", { count: questionCount })}
              </dd>
            </div>
            {detail.report.evidenceVerified && (
              <div className={styles.row}>
                <dt>{t("detail.verified")}</dt>
                <dd>●</dd>
              </div>
            )}
          </dl>

          {/* The report content: rounds → questions → topics. Hidden for a
              soft-deleted report (the owner sees only the deleted notice). */}
          {!isDeleted && roundCount > 0 && (
            <>
              <FtlRule />
              <p className={styles.sectionHeading}>
                {t("detail.roundsHeading")}
              </p>
              <div className={styles.rounds}>
                {detail.rounds.map((round, i) => (
                  <section key={i} className={styles.round}>
                    <div className={styles.round__head}>
                      <span className={styles.round__type}>
                        {tRounds(`type.${round.roundType}`)}
                      </span>
                      <span className={styles.round__rating}>
                        {tRounds(`rating.${round.rating}`)}
                      </span>
                    </div>
                    {round.experienceProse && (
                      <p className={styles.round__experience}>
                        {round.experienceProse}
                      </p>
                    )}
                    {round.questions.length > 0 && (
                      <ul className={styles.questions}>
                        {round.questions.map((q, qi) => (
                          <li key={qi}>
                            <p className={styles.question__prose}>{q.prose}</p>
                            {q.topics.length > 0 && (
                              <div className={styles.question__topics}>
                                {q.topics.map((topic) => (
                                  <FtlTag key={topic.id} variant="ghost">
                                    {topic.name}
                                  </FtlTag>
                                ))}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
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
