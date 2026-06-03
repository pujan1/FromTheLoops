import type { RoundDraft, SubmissionDraft } from "@fromtheloop/shared";
import type { Question, Round } from "./types";

export const AUTOSAVE_DELAY_MS = 2000;

function newKey(): string {
  // crypto.randomUUID exists in every browser we target; the fallback keeps
  // SSR/non-secure-context safe.
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function newQuestion(): Question {
  return { key: newKey(), prose: "", tags: [] };
}

export function newRound(): Round {
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
export function fromDraftRounds(rounds: SubmissionDraft["rounds"]): Round[] {
  if (!rounds) return [];
  return rounds.map((r) => ({
    key: newKey(),
    roundType: r.roundType ?? null,
    rating: r.rating ?? null,
    experience: r.experience ?? "",
    questions: (r.questions ?? []).map((q) => ({
      key: newKey(),
      prose: q.prose ?? "",
      tags: q.tags ?? [],
    })),
    collapsed: true, // restored rounds start collapsed — overview first.
  }));
}

// "Pristine" = the user hasn't started this unit yet, so we hold back the
// inline validation errors that would otherwise nag a freshly-added card.
// A question they've touched (typed prose or added a tag) or a round they've
// begun (typed/rated/described it, or added a question) is fair game.
export function questionIsPristine(q: Question): boolean {
  return q.prose.trim().length === 0 && q.tags.length === 0;
}

export function roundIsPristine(r: Round): boolean {
  return (
    r.roundType === null &&
    r.rating === null &&
    r.experience.trim().length === 0 &&
    r.questions.length === 0
  );
}

// Serialize UI state back to the shared RoundDraft[] for autosave.
export function toDraftRounds(rounds: Round[]): RoundDraft[] {
  return rounds.map((r) => ({
    roundType: r.roundType,
    rating: r.rating,
    experience: r.experience,
    questions: r.questions.map((q) => ({ prose: q.prose, tags: q.tags })),
  }));
}
