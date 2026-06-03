"use client";

// Per-round card UI (Sprint 2 Day 2). The submission flow's second screen:
// the user adds a collapsible card per interview round, each holding the
// round type, a rating, free-text experience, and a list of questions.
//
// Scope today is the *structure* — add/remove rounds and questions, with
// keyboard-navigable controls and draft autosave. The topic-tag combobox per
// question lands Day 3 (a placeholder hint marks the seam) and the strict
// finalize validation lands Day 4. State is held here as a flat array with
// stable client keys (rounds have no DB id until finalize); it serializes to
// the shared RoundDraft[] shape for autosave, merged into the existing draft
// so the top-level basics are never clobbered.

import {
  HONEYPOT_FIELD,
  MAX_QUESTIONS_PER_ROUND,
  MAX_ROUNDS,
  type RoundDraft,
  ROUND_RATINGS,
  ROUND_TYPES,
  type RoundRating,
  type RoundType,
  type SubmissionDraft,
} from "@fromtheloop/shared";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Body, Button } from "@/components/ui";
import { saveDraft } from "../actions";
import styles from "./rounds.module.css";

const AUTOSAVE_DELAY_MS = 2000;

type SaveState = "idle" | "saving" | "saved" | "error";

// Client-only view models: the draft shapes plus a stable `key` so React
// reconciles cards/questions across reorders and removals (rounds carry no
// id until the finalize transaction writes them). Topic tags per question
// land Day 3, so `Question` is just prose for now.
interface Question {
  key: string;
  prose: string;
}

interface Round {
  key: string;
  roundType: RoundType | null;
  rating: RoundRating | null;
  experience: string;
  questions: Question[];
  collapsed: boolean;
}

function newKey(): string {
  // crypto.randomUUID is available in every browser we target; the fallback
  // keeps SSR/non-secure-context safe.
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function newQuestion(): Question {
  return { key: newKey(), prose: "" };
}

function newRound(): Round {
  return {
    key: newKey(),
    roundType: null,
    rating: null,
    experience: "",
    questions: [],
    collapsed: false,
  };
}

// Hydrate UI state from a persisted draft's rounds[].
function fromDraftRounds(rounds: SubmissionDraft["rounds"]): Round[] {
  if (!rounds) return [];
  return rounds.map((r) => ({
    key: newKey(),
    roundType: r.roundType ?? null,
    rating: r.rating ?? null,
    experience: r.experience ?? "",
    questions: (r.questions ?? []).map((q) => ({
      key: newKey(),
      prose: q.prose ?? "",
    })),
    collapsed: true, // restored rounds start collapsed — overview first.
  }));
}

// Serialize UI state back to the shared RoundDraft[] for autosave. Tags are
// not yet edited here (Day 3), so each question persists an empty tags[].
function toDraftRounds(rounds: Round[]): RoundDraft[] {
  return rounds.map((r) => ({
    roundType: r.roundType,
    rating: r.rating,
    experience: r.experience,
    questions: r.questions.map((q) => ({ prose: q.prose, tags: [] })),
  }));
}

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
  const baseId = useId();

  const [rounds, setRounds] = useState<Round[]>(() =>
    fromDraftRounds(initialData.rounds),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const honeypotRef = useRef<HTMLInputElement>(null);
  // A round key to focus after the next render (set when adding a round).
  const focusRoundKey = useRef<string | null>(null);
  const addRoundRef = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const atRoundCap = rounds.length >= MAX_ROUNDS;

  // --- autosave (mirrors submit-form): debounce, then merge rounds into the
  // existing draft data so top-level basics are preserved. -------------------
  const draftRounds = useMemo(() => toDraftRounds(rounds), [rounds]);
  const serialized = JSON.stringify(draftRounds);
  const lastSavedRef = useRef(serialized);

  useEffect(() => {
    if (serialized === lastSavedRef.current) return;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveDraft({
          id: draftId,
          data: { ...initialData, rounds: draftRounds },
          honeypot: honeypotRef.current?.value ?? "",
        });
        lastSavedRef.current = serialized;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [serialized, draftId, draftRounds, initialData]);

  // Move focus to a freshly added round's type control.
  useEffect(() => {
    const key = focusRoundKey.current;
    if (!key) return;
    focusRoundKey.current = null;
    const card = cardRefs.current.get(key);
    card?.querySelector<HTMLSelectElement>("select")?.focus();
  }, [rounds.length]);

  // --- mutations ------------------------------------------------------------
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

  return (
    <div className={styles.form}>
      {/* Honeypot — same trap as the basics form; saveDraft drops a write
          where this comes back non-empty. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor={`${baseId}-website`}>Website</label>
        <input
          ref={honeypotRef}
          id={`${baseId}-website`}
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      {rounds.length === 0 ? (
        <div className={styles.empty}>
          <Body tone="muted">{t("empty")}</Body>
          <Button variant="ghost" onClick={addRound}>
            {t("addFirstRound")}
          </Button>
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
        <a className={styles.back} href={`/drafts/${draftId}`}>
          {t("back")}
        </a>
        <span className={styles.saveState} aria-live="polite">
          {saveState === "saving" && t("save.saving")}
          {saveState === "saved" && t("save.saved")}
          {saveState === "error" && t("save.error")}
        </span>
      </div>
    </div>
  );
}

// --- one round card -------------------------------------------------------
// Split out so React re-renders only the edited card (Sprint 2 risk note:
// keep per-card work minimal as users add 5+ rounds).
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
  t: ReturnType<typeof useTranslations>;
  tq: ReturnType<typeof useTranslations>;
  tTags: ReturnType<typeof useTranslations>;
}

function RoundCard({
  index,
  round,
  registerRef,
  onToggle,
  onRemove,
  onPatch,
  onAddQuestion,
  onRemoveQuestion,
  onPatchQuestion,
  t,
  tq,
  tTags,
}: RoundCardProps) {
  const baseId = useId();
  const n = index + 1;
  const bodyId = `${baseId}-body`;
  const typeLabel = round.roundType ? t(`type.${round.roundType}`) : t("untyped");
  const atQuestionCap = round.questions.length >= MAX_QUESTIONS_PER_ROUND;

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
        <div className={styles.field}>
          <label htmlFor={`${baseId}-type`} className={styles.label}>
            {t("typeLabel")}
            <span className={styles.required} aria-hidden="true">
              {" "}
              *
            </span>
          </label>
          <select
            id={`${baseId}-type`}
            className={styles.select}
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
          </select>
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>
            {t("ratingLabel")}
            <span className={styles.required} aria-hidden="true">
              {" "}
              *
            </span>
          </legend>
          <div className={styles.chips}>
            {ROUND_RATINGS.map((r) => (
              <label
                key={r}
                className={`${styles.chip} ${
                  round.rating === r ? styles.chipActive : ""
                }`}
              >
                <input
                  type="radio"
                  name={`${baseId}-rating`}
                  value={r}
                  checked={round.rating === r}
                  onChange={() => onPatch({ rating: r })}
                  className={styles.srOnly}
                />
                {t(`rating.${r}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.field}>
          <label htmlFor={`${baseId}-exp`} className={styles.label}>
            {t("experienceLabel")}
          </label>
          <textarea
            id={`${baseId}-exp`}
            className={styles.textarea}
            value={round.experience}
            placeholder={t("experiencePlaceholder")}
            rows={3}
            onChange={(e) => onPatch({ experience: e.target.value })}
          />
        </div>

        {/* Questions */}
        <div className={styles.questions}>
          <div className={styles.questionsHead}>
            <span className={styles.label}>{tq("heading")}</span>
          </div>
          {round.questions.length === 0 ? (
            <Body size="small" tone="muted">
              {tq("empty")}
            </Body>
          ) : (
            <ol className={styles.questionList}>
              {round.questions.map((q, qi) => (
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
                  <textarea
                    className={styles.textarea}
                    value={q.prose}
                    placeholder={tq("prosePlaceholder")}
                    rows={2}
                    aria-label={tq("proseLabel")}
                    onChange={(e) => onPatchQuestion(q.key, e.target.value)}
                  />
                  {/* Topic tagging lands Day 3 — placeholder marks the seam. */}
                  <p className={styles.tagsPlaceholder}>{tTags("comingSoon")}</p>
                </li>
              ))}
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
