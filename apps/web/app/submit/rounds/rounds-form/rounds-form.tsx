"use client";

// Submission flow's second screen: a collapsible card per interview round.
// State is a flat array with stable client keys (no DB id until finalize),
// serialized to RoundDraft[] and merged into the draft so the basics survive.

import {
  MAX_QUESTIONS_PER_ROUND,
  MAX_ROUNDS,
  type SubmissionDraft,
  type TopicTagSelection,
  validateFinalSubmission,
} from "@fromtheloop/shared";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { FtlBody, FtlButton, FtlHoneypot, FtlNotice } from "@/components/ui";
import { routes } from "@/lib/routes";
import { noticeToneForError, useActionStatus } from "@/lib/use-action-status";
import { saveDraft } from "../../actions";
import styles from "../rounds.module.css";
import {
  AUTOSAVE_DELAY_MS,
  fromDraftRounds,
  newQuestion,
  newRound,
  toDraftRounds,
} from "./helpers";
import { RoundCard } from "./round-card";
import type { Round } from "./types";

export interface RoundsFormProps {
  draftId: string;
  // The full persisted draft (top-level basics + any saved rounds). Spread
  // back into every autosave so the basics survive a rounds-only save.
  initialData: SubmissionDraft;
}

export function RoundsForm({ draftId, initialData }: RoundsFormProps) {
  const t = useTranslations("rounds");
  const tq = useTranslations("questions");
  const tTags = useTranslations("tags");

  const [rounds, setRounds] = useState<Round[]>(() =>
    fromDraftRounds(initialData.rounds),
  );

  // Autosave through the action hook: status drives the save indicator, error
  // drives the failure notice. Same pattern as the basics screen.
  const save = useActionStatus(saveDraft);

  const honeypotRef = useRef<HTMLInputElement>(null);
  // A round key to focus after the next render (set when adding a round).
  const focusRoundKey = useRef<string | null>(null);
  const addRoundRef = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const atRoundCap = rounds.length >= MAX_ROUNDS;

  // Debounced autosave; merges rounds into the draft so basics are preserved.
  const draftRounds = useMemo(() => toDraftRounds(rounds), [rounds]);
  const serialized = JSON.stringify(draftRounds);
  const lastSavedRef = useRef(serialized);

  // Live finalize validation against the shared server-side gate (Day 4). We
  // only surface a round's per-field issues; the basics fields belong to the
  // previous screen, so their issues are computed but not rendered here. When
  // the whole submission validates, there are no issues to show.
  const roundIssues = useMemo(() => {
    const result = validateFinalSubmission({ ...initialData, rounds: draftRounds });
    return result.ok ? null : result.issues.rounds;
  }, [initialData, draftRounds]);

  const runSave = save.run;
  useEffect(() => {
    if (serialized === lastSavedRef.current) return;
    const timer = setTimeout(async () => {
      const res = await runSave({
        id: draftId,
        data: { ...initialData, rounds: draftRounds },
        honeypot: honeypotRef.current?.value ?? "",
      });
      if (!res.ok) return;
      lastSavedRef.current = serialized;
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [serialized, draftId, draftRounds, initialData, runSave]);

  // Move focus to a freshly added round's type control.
  useEffect(() => {
    const key = focusRoundKey.current;
    if (!key) return;
    focusRoundKey.current = null;
    const card = cardRefs.current.get(key);
    card?.querySelector<HTMLSelectElement>("select")?.focus();
  }, [rounds.length]);

  function addRound() {
    if (atRoundCap) return;
    const r = newRound();
    focusRoundKey.current = r.key;
    setRounds((prev) => [...prev, r]);
  }

  function removeRound(key: string) {
    setRounds((prev) => prev.filter((r) => r.key !== key));
    cardRefs.current.delete(key);
    // Return focus to the add button so keyboard users aren't dropped.
    requestAnimationFrame(() => addRoundRef.current?.focus());
  }

  function patchRound(key: string, patch: Partial<Omit<Round, "key">>) {
    setRounds((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function toggleCollapsed(key: string) {
    setRounds((prev) =>
      prev.map((r) => (r.key === key ? { ...r, collapsed: !r.collapsed } : r)),
    );
  }

  function addQuestion(roundKey: string) {
    setRounds((prev) =>
      prev.map((r) =>
        r.key === roundKey && r.questions.length < MAX_QUESTIONS_PER_ROUND
          ? { ...r, questions: [...r.questions, newQuestion()] }
          : r,
      ),
    );
  }

  function removeQuestion(roundKey: string, questionKey: string) {
    setRounds((prev) =>
      prev.map((r) =>
        r.key === roundKey
          ? { ...r, questions: r.questions.filter((q) => q.key !== questionKey) }
          : r,
      ),
    );
  }

  function patchQuestion(roundKey: string, questionKey: string, prose: string) {
    setRounds((prev) =>
      prev.map((r) =>
        r.key === roundKey
          ? {
              ...r,
              questions: r.questions.map((q) =>
                q.key === questionKey ? { ...q, prose } : q,
              ),
            }
          : r,
      ),
    );
  }

  function patchQuestionTags(
    roundKey: string,
    questionKey: string,
    tags: TopicTagSelection[],
  ) {
    setRounds((prev) =>
      prev.map((r) =>
        r.key === roundKey
          ? {
              ...r,
              questions: r.questions.map((q) =>
                q.key === questionKey ? { ...q, tags } : q,
              ),
            }
          : r,
      ),
    );
  }

  return (
    <div className={styles.form}>
      <FtlHoneypot ref={honeypotRef} />

      {rounds.length === 0 ? (
        <div className={styles.empty}>
          <FtlBody tone="muted">{t("empty")}</FtlBody>
          <FtlButton variant="ghost" onClick={addRound}>
            {t("addFirstRound")}
          </FtlButton>
        </div>
      ) : (
        <>
          <ol className={styles.list}>
            {rounds.map((round, i) => (
              <RoundCard
                key={round.key}
                index={i}
                round={round}
                registerRef={(el) => {
                  if (el) cardRefs.current.set(round.key, el);
                  else cardRefs.current.delete(round.key);
                }}
                onToggle={() => toggleCollapsed(round.key)}
                onRemove={() => removeRound(round.key)}
                onPatch={(patch) => patchRound(round.key, patch)}
                onAddQuestion={() => addQuestion(round.key)}
                onRemoveQuestion={(qKey) => removeQuestion(round.key, qKey)}
                onPatchQuestion={(qKey, prose) =>
                  patchQuestion(round.key, qKey, prose)
                }
                onPatchQuestionTags={(qKey, tags) =>
                  patchQuestionTags(round.key, qKey, tags)
                }
                issues={roundIssues?.[i] ?? null}
                t={t}
                tq={tq}
                tTags={tTags}
              />
            ))}
          </ol>

          <div className={styles.addRow}>
            <button
              type="button"
              className={styles.addRound}
              onClick={addRound}
              disabled={atRoundCap}
              ref={addRoundRef}
            >
              + {t("addRound")}
            </button>
            {atRoundCap && (
              <span className={styles.cap}>
                {t("capReached", { max: MAX_ROUNDS })}
              </span>
            )}
          </div>
        </>
      )}

      <div className={styles.actions}>
        <a className={styles.back} href={routes.draft(draftId)}>
          {t("back")}
        </a>
        <span className={styles.saveState} aria-live="polite">
          {save.isPending && t("save.saving")}
          {save.isSuccess && t("save.saved")}
        </span>
      </div>

      {save.error && (
        <FtlNotice tone={noticeToneForError(save.error)} title={t("save.error")}>
          {save.error.message}
        </FtlNotice>
      )}
    </div>
  );
}
