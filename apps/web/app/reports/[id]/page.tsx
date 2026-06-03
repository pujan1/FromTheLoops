import { currentUser } from "@clerk/nextjs/server";
import {
  EDIT_WINDOW_MS,
  getDb,
  getOrCreateUserByClerkId,
  getReportForEdit,
  isReportEditable,
} from "@fromtheloop/db";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import {
  FtlBody,
  FtlButton,
  FtlContainer,
  FtlDisplay,
  FtlEyebrow,
  FtlNotice,
  FtlRule,
  FtlSiteHeader,
} from "@/components/ui";
import { routes } from "@/lib/routes";
import { startReportEdit } from "./actions";
import styles from "./reports.module.css";

// A submitted report's owner view. Reports aren't public until Sprint 4, so
// this is strictly the author's own view — getReportForEdit is ownership-scoped
// and a foreign/guessed id 404s. Doubles as the post-submit landing page (the
// rounds form routes here on success) and the entry point to the 24h edit flow.
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect(routes.signIn);

  const { id } = await params;
  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  const detail = await getReportForEdit(db, id, internal.id);
  if (!detail) notFound();

  const t = await getTranslations("report");
  const tOutcome = await getTranslations("submit");

  const editable = isReportEditable(detail.report);
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

  return (
    <>
      <FtlSiteHeader />
      <main className={styles.page}>
        <FtlContainer width="prose">
          <FtlEyebrow tone="accent">{t("eyebrow")}</FtlEyebrow>
          <FtlDisplay as="h1" size="lg" style={{ marginTop: 24 }}>
            {detail.company.name} · {detail.role.name}
          </FtlDisplay>
          <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
            {t(`status.${detail.report.status}`)}
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
          </dl>

          <FtlRule />

          {editable ? (
            <div className={styles.editBlock}>
              <FtlBody tone="muted">
                {t("edit.window", { hours: hoursLeft })}
              </FtlBody>
              <form action={startReportEdit}>
                <input type="hidden" name="reportId" value={detail.report.id} />
                <FtlButton type="submit" variant="primary" trailingArrow>
                  {t("edit.cta")}
                </FtlButton>
              </form>
            </div>
          ) : (
            <FtlNotice tone="info" title={t("edit.lockedTitle")}>
              {t("edit.locked")}
            </FtlNotice>
          )}
        </FtlContainer>
      </main>
    </>
  );
}
