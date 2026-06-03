import type { RoundRating, RoundType, TopicTagSelection } from "@fromtheloop/shared";

// Client view models: draft shapes plus a stable `key` for React reconciliation
// (rounds have no DB id until finalize).
export interface Question {
  key: string;
  prose: string;
  tags: TopicTagSelection[];
}

export interface Round {
  key: string;
  roundType: RoundType | null;
  rating: RoundRating | null;
  experience: string;
  questions: Question[];
  collapsed: boolean;
}
