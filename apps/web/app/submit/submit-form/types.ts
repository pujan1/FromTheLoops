import type { SubmissionDraft } from "@fromtheloop/shared";

// Canonical seniority tier a level maps to (mirrors the db level_tier enum).
// null = unmapped rung → no seniority prefix in the dropdown label.
export type LevelTier =
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "senior_staff"
  | "principal";

export interface LevelOption {
  id: string;
  slug: string;
  name: string;
  tier: LevelTier | null;
}

export type FieldErrors = Partial<
  Record<"company" | "role" | "level" | "month", string>
>;

export interface SubmitFormProps {
  initialDraftId?: string;
  initialData?: SubmissionDraft | null;
}
