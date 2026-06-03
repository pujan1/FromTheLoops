import {
  MAX_QUESTIONS_PER_ROUND,
  ROUND_RATINGS,
  ROUND_TYPES,
  type RoundIssues,
  type RoundType,
  type TopicTagSelection,
} from "@fromtheloop/shared";
import type { useTranslations } from "next-intl";
import { useId } from "react";
import { FtlBody, FtlChoiceChips, FtlField, FtlSelect, FtlTextarea } from "@/components/ui";
import styles from "../rounds.module.css";
import { questionIsPristine, roundIsPristine } from "./helpers";
import { TagPicker } from "./tag-picker";
import type { Round } from "./types";

// Split out so React re-renders only the edited card as users add rounds.
interface RoundCardProps {
  index: number;
  round: Round;
  registerRef: (el: HTMLLIElement | null) => void;
  onToggle: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<Omit<Round, "key">>) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (questionKey: string) => void;
  onPatchQuestion: (questionKey: string, prose: string) => void;
  onPatchQuestionTags: (questionKey: string, tags: TopicTagSelection[]) => void;
  // Live finalize issues for this round (null when the whole submission is
  // valid). Errors are held back for pristine cards so a freshly-added round
  // isn't pre-emptively flagged.
  issues: RoundIssues | null;
  t: ReturnType<typeof useTranslations>;
  tq: ReturnType<typeof useTranslations>;
  tTags: ReturnType<typeof useTranslations>;
}

export function RoundCard({
  index,
  round,
  registerRef,
  onToggle,
  onRemove,
  onPatch,
  onAddQuestion,
  onRemoveQuestion,
  onPatchQuestion,
  onPatchQuestionTags,
  issues,
  t,
  tq,
  tTags,
}: RoundCardProps) {
  const bodyId = useId();
  const n = index + 1;
  const typeLabel = round.roundType ? t(`type.${round.roundType}`) : t("untyped");
  const atQuestionCap = round.questions.length >= MAX_QUESTIONS_PER_ROUND;

  // Hold errors back until the user has engaged with the card.
  const showRoundErrors = issues != null && !roundIsPristine(round);

  return (
    <li className={styles.card} ref={registerRef}>
      <div className={styles.cardHeader}>
        <button
          type="button"
          className={styles.cardToggle}
          aria-expanded={!round.collapsed}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className={styles.chevron} aria-hidden="true">
            {round.collapsed ? "▸" : "▾"}
          </span>
          <span className={styles.cardTitle}>
            <span className={styles.roundN}>{t("roundLabel", { n })}</span>
            <span className={styles.roundType}>{typeLabel}</span>
          </span>
          <span className={styles.qCount}>
            {t("questionCount", { count: round.questions.length })}
          </span>
        </button>
        <button
          type="button"
          className={styles.removeRound}
          onClick={onRemove}
          aria-label={t("removeRound", { n })}
        >
          {t("remove")}
        </button>
      </div>

      <div id={bodyId} hidden={round.collapsed} className={styles.cardBody}>
        <FtlField
          label={t("typeLabel")}
          required
          error={showRoundErrors && issues.roundType ? t("errors.roundType") : undefined}
        >
          {(id) => (
            <FtlSelect
              id={id}
              value={round.roundType ?? ""}
              onChange={(e) =>
                onPatch({ roundType: (e.target.value || null) as RoundType | null })
              }
            >
              <option value="">{t("typePlaceholder")}</option>
              {ROUND_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {t(`type.${rt}`)}
                </option>
              ))}
            </FtlSelect>
          )}
        </FtlField>

        <div>
          <FtlChoiceChips
            legend={t("ratingLabel")}
            required
            options={ROUND_RATINGS}
            value={round.rating}
            onChange={(rating) => onPatch({ rating })}
            renderOption={(r) => t(`rating.${r}`)}
          />
          {showRoundErrors && issues.rating && (
            <p className={styles.error}>{t("errors.rating")}</p>
          )}
        </div>

        <FtlField label={t("experienceLabel")}>
          {(id) => (
            <FtlTextarea
              id={id}
              value={round.experience}
              placeholder={t("experiencePlaceholder")}
              rows={3}
              onChange={(e) => onPatch({ experience: e.target.value })}
            />
          )}
        </FtlField>

        <div className={styles.questions}>
          <div className={styles.questionsHead}>
            <span className={styles.label}>{tq("heading")}</span>
          </div>
          {round.questions.length === 0 ? (
            <FtlBody size="small" tone="muted">
              {tq("empty")}
            </FtlBody>
          ) : (
            <ol className={styles.questionList}>
              {round.questions.map((q, qi) => {
                const qIssue = issues?.questions[qi];
                const showQErrors = qIssue != null && !questionIsPristine(q);
                return (
                <li key={q.key} className={styles.question}>
                  <div className={styles.questionHead}>
                    <span className={styles.label}>
                      {tq("label", { n: qi + 1 })}
                    </span>
                    <button
                      type="button"
                      className={styles.removeQuestion}
                      onClick={() => onRemoveQuestion(q.key)}
                      aria-label={tq("remove", { n: qi + 1 })}
                    >
                      {t("remove")}
                    </button>
                  </div>
                  <FtlTextarea
                    value={q.prose}
                    placeholder={tq("prosePlaceholder")}
                    rows={2}
                    aria-label={tq("proseLabel")}
                    onChange={(e) => onPatchQuestion(q.key, e.target.value)}
                  />
                  {showQErrors && qIssue.prose && (
                    <p className={styles.error}>{tq("errors.prose")}</p>
                  )}
                  <TagPicker
                    tags={q.tags}
                    onChange={(tags) => onPatchQuestionTags(q.key, tags)}
                    t={tTags}
                  />
                  {showQErrors && qIssue.tags && (
                    <p className={styles.error}>{tq("errors.tags")}</p>
                  )}
                </li>
                );
              })}
            </ol>
          )}
          <div className={styles.addRow}>
            <button
              type="button"
              className={styles.addQuestion}
              onClick={onAddQuestion}
              disabled={atQuestionCap}
            >
              + {tq("add")}
            </button>
            {atQuestionCap && (
              <span className={styles.cap}>
                {tq("capReached", { max: MAX_QUESTIONS_PER_ROUND })}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
