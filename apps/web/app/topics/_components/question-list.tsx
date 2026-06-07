import type { TopicQuestionListItem } from "@fromtheloop/db";
import { levelLabel, outcomeLabel } from "@/lib/labels";
import { routes } from "@/lib/routes";
import styles from "../topics.module.css";

// The topic page's Position X — a question-grain list (PLAN.md §URL: "topic
// pages aggregate questions"). Each card shows the question prose and a source
// line that links to the report it came from, with a company chip. On the
// topic×company page the company is constant (it's in the header), so
// `showCompany={false}` drops the chip and leads with the role instead.
// Server component; no client JS.
export function QuestionList({
  items,
  showCompany = true,
  emptyMessage = "No questions tagged with this topic yet.",
}: {
  items: TopicQuestionListItem[];
  showCompany?: boolean;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div className={styles.questionList}>
      {items.map((q) => (
        <a
          key={q.questionId}
          className={styles.questionCard}
          href={routes.report(q.reportId)}
        >
          <p className={styles.questionCard__prose}>{q.prose}</p>
          <div className={styles.questionCard__meta}>
            {showCompany && (
              <>
                <span className={styles.questionCard__company}>
                  {q.companyName}
                </span>
                <span className={styles.questionCard__sep} aria-hidden="true">
                  ·
                </span>
              </>
            )}
            <span>{q.roleName}</span>
            <span className={styles.questionCard__sep} aria-hidden="true">
              ·
            </span>
            <span>{levelLabel(q.level)}</span>
            <span className={styles.questionCard__sep} aria-hidden="true">
              ·
            </span>
            <span>{outcomeLabel(q.outcome)}</span>
            <span className={styles.questionCard__sep} aria-hidden="true">
              ·
            </span>
            <span>{q.interviewMonth}</span>
            {q.evidenceVerified && (
              <>
                <span className={styles.questionCard__sep} aria-hidden="true">
                  ·
                </span>
                <span>verified</span>
              </>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
