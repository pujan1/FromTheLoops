import type { RoundRating, RoundType } from "@fromtheloop/shared";

export type SaveState = "idle" | "saving" | "saved" | "error";

// Client view models: draft shapes plus a stable `key` for React reconciliation
// (rounds have no DB id until finalize).
export interface Question {
  key: string;
  prose: string;
}

export interface Round {
  key: string;
  roundType: RoundType | null;
  rating: RoundRating | null;
  experience: string;
  questions: Question[];
  collapsed: boolean;
}
