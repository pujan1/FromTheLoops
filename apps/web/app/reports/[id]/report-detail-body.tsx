"use client";

import type { ReportDetailView } from "@fromtheloop/db";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FtlBody, FtlDisplay, FtlEyebrow, FtlRule, FtlTag } from "@/components/ui";
import styles from "./reports.module.css";

// ADR-0010 keystone — the single presentational rendering of a report's content
// (title · summary · rounds→questions→topics tree), shared by BOTH the SSR detail
// page (`/reports/[id]`) and the client triage pane. Extracted so the fiddly
// rounds JSX is never forked into a second "preview" representation that drifts —
// for interview prep the rounds/questions content IS the triage signal.
//
// Content-only by design. The viewer-specific chrome stays the caller's:
//   - `eyebrow` / `byline` differ per viewer (owner sees status; a public reader
//     sees the attribution line), so each caller supplies the resolved values.
//   - helpful-flag + owner controls live OUTSIDE this body (page passes
//     server-resolved state; pane passes client-fetched state).
//   - `hideRounds` preserves the page's deleted-report case (owner sees the
//     summary but not the rounds of a soft-deleted report); the pane never hits
//     it (a deleted report 404s before the pane can open it).
//
// Client component (uses useTranslations under the app's NextIntlClientProvider)
// so it renders identically whether mounted by the server page or the client pane.
export function ReportDetailBody({
  detail,
  eyebrow,
  byline,
  hideRounds = false,
}: {
  detail: ReportDetailView;
  eyebrow: string;
  byline: ReactNode;
  hideRounds?: boolean;
}) {
  const t = useTranslations("report");
  const tRounds = useTranslations("rounds");
  const tOutcome = useTranslations("submit");

  const roundCount = detail.rounds.length;
  const questionCount = detail.rounds.reduce(
    (sum, r) => sum + r.questions.length,
    0,
  );
  const outcomeLabel = detail.outcome
    ? tOutcome(`outcome.${detail.outcome}`)
    : t("outcome.none");

  return (
    <>
      <FtlEyebrow tone="accent">{eyebrow}</FtlEyebrow>
      <FtlDisplay as="h1" size="lg" style={{ marginTop: 24 }}>
        {detail.companyName} · {detail.roleName}
      </FtlDisplay>
      <FtlBody size="lead" tone="muted" style={{ marginTop: 16 }}>
        {byline}
      </FtlBody>
      <FtlRule />

      <dl className={styles.summary}>
        <div className={styles.row}>
          <dt>{t("summary.level")}</dt>
          <dd>{detail.levelName}</dd>
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
        {detail.evidenceVerified && (
          <div className={styles.row}>
            <dt>{t("detail.verified")}</dt>
            <dd>●</dd>
          </div>
        )}
      </dl>

      {/* The report content: rounds → questions → topics. Hidden for a
          soft-deleted report (the owner sees only the deleted notice). */}
      {!hideRounds && roundCount > 0 && (
        <>
          <FtlRule />
          <p className={styles.sectionHeading}>{t("detail.roundsHeading")}</p>
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
    </>
  );
}
