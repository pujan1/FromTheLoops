import type { SubmissionDraft } from "@fromtheloop/shared";

export interface LevelOption {
  id: string;
  slug: string;
  name: string;
}

export type FieldErrors = Partial<
  Record<"company" | "role" | "level" | "month", string>
>;

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface SubmitFormProps {
  initialDraftId?: string;
  initialData?: SubmissionDraft | null;
}
