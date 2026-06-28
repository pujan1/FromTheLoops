// Zod validators for the submission form. submissionDraftSchema is fully
// nullish (backs autosave); submissionReadySchema and validateFinalSubmission
// are the stricter gates. Enum tuples mirror the db enums (no db import).

import { z } from "zod";

export const REPORT_OUTCOMES = [
  "offer",
  "reject",
  "withdrew",
  "ghosted",
  "pending",
] as const;

export const DISPLAY_ATTRIBUTIONS = ["display_name", "anonymous"] as const;

export const ROUND_TYPES = [
  "recruiter-screen",
  "technical-phone",
  "onsite-coding",
  "onsite-system-design",
  "onsite-behavioral",
  "take-home",
  "hiring-manager",
  "exec-final",
  "other",
] as const;

export const ROUND_RATINGS = ["positive", "mixed", "negative"] as const;

// Per-submission caps, well over any realistic loop.
export const MAX_ROUNDS = 20;
export const MAX_QUESTIONS_PER_ROUND = 30;

export const outcomeSchema = z.enum(REPORT_OUTCOMES);
export const attributionSchema = z.enum(DISPLAY_ATTRIBUTIONS);
export const roundTypeSchema = z.enum(ROUND_TYPES);
export const roundRatingSchema = z.enum(ROUND_RATINGS);

// Existing taxonomy row (uuid) OR a user suggestion (name only).
export const companySelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("suggested"),
    name: z.string().trim().min(1).max(120),
  }),
]);

export const companySuggestionSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

// Roles are a closed canonical set — existing-only.
export const roleSelectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
});

// id = null → the "Unspecified" sentinel. `name` lands in interview_reports.level.
export const levelSelectionSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().min(1),
});

// Existing vs suggested, like company. Only "existing" tags count toward the
// ≥1-tag-per-question rule.
export const topicTagSelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    id: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("suggested"),
    name: z.string().trim().min(1).max(80),
  }),
]);

export const topicSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

// Draft-tolerant; the finalize gate requires non-empty prose + ≥1 active tag.
export const questionDraftSchema = z.object({
  prose: z.string().nullish(),
  tags: z.array(topicTagSelectionSchema).default([]),
});

// Draft-tolerant; finalize requires roundType + rating.
export const roundDraftSchema = z.object({
  roundType: roundTypeSchema.nullish(),
  rating: roundRatingSchema.nullish(),
  experience: z.string().nullish(),
  questions: z.array(questionDraftSchema).default([]),
});

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected a YYYY-MM month");

// Current "YYYY-MM"; the finalize gate falls back to this when no month is set.
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Sentinel level for a submission with no level (the column is NOT NULL). These
// reports count in the role grain but never form a level cell.
export const UNSPECIFIED_LEVEL_NAME = "Unspecified";
export const UNSPECIFIED_LEVEL: LevelSelection = {
  id: null,
  name: UNSPECIFIED_LEVEL_NAME,
};
export const NA_LEVEL: LevelSelection = UNSPECIFIED_LEVEL; // back-compat alias

// Tolerant of a partially-filled form.
export const submissionDraftSchema = z.object({
  company: companySelectionSchema.nullish(),
  role: roleSelectionSchema.nullish(),
  level: levelSelectionSchema.nullish(),
  outcome: outcomeSchema.nullish(),
  month: monthSchema.nullish(),
  attribution: attributionSchema.default("anonymous"),
  rounds: z.array(roundDraftSchema).max(MAX_ROUNDS).nullish(),
  editingReportId: z.string().uuid().nullish(), // set → edit-in-place at finalize
});

// "Continue → Rounds" gate: only company + role required; rest defaulted later.
export const submissionReadySchema = z.object({
  company: companySelectionSchema,
  role: roleSelectionSchema,
  level: levelSelectionSchema.nullish(),
  outcome: outcomeSchema.nullable(),
  month: monthSchema.nullish(),
  attribution: attributionSchema,
});

// Finalize validation — the strict server-side gate. Rules: 0 rounds is OK; a
// round needs roundType + rating; a question needs prose + ≥1 active tag; only
// company/role required (level/month defaulted).

export interface FinalQuestion {
  prose: string;
  tags: TopicTagSelection[]; // ≥1 guaranteed "existing"
}

export interface FinalRound {
  roundType: RoundType;
  rating: RoundRating;
  experience: string | null;
  questions: FinalQuestion[];
}

export interface FinalSubmission {
  company: CompanySelection;
  role: RoleSelection;
  level: LevelSelection;
  outcome: ReportOutcome | null;
  month: string;
  attribution: DisplayAttribution;
  rounds: FinalRound[];
}

// true = field in error. Mirrors the form's shape for inline highlighting.
export interface QuestionIssues {
  prose: boolean;
  tags: boolean;
}

export interface RoundIssues {
  roundType: boolean;
  rating: boolean;
  questions: QuestionIssues[];
}

export interface SubmissionIssues {
  company: boolean;
  role: boolean;
  level: boolean; // always false (defaulted, never flagged)
  month: boolean; // always false
  rounds: RoundIssues[];
  malformed?: boolean; // payload didn't parse as a draft; per-field flags meaningless
}

export type SubmissionValidation =
  | { ok: true; data: FinalSubmission }
  | { ok: false; issues: SubmissionIssues };

function blankIssues(): SubmissionIssues {
  return { company: false, role: false, level: false, month: false, rounds: [] };
}

function activeTagCount(tags: TopicTagSelection[]): number {
  return tags.filter((t) => t.kind === "existing").length;
}

// Re-parses the raw draft, then applies the strict finalize rules in code.
export function validateFinalSubmission(data: unknown): SubmissionValidation {
  const parsed = submissionDraftSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, issues: { ...blankIssues(), malformed: true } };
  }
  const draft = parsed.data;
  const issues = blankIssues();
  let ok = true;

  if (!draft.company) {
    issues.company = true;
    ok = false;
  }
  if (!draft.role) {
    issues.role = true;
    ok = false;
  }

  const rounds = draft.rounds ?? [];
  for (const round of rounds) {
    const roundIssue: RoundIssues = {
      roundType: !round.roundType,
      rating: !round.rating,
      questions: [],
    };
    if (roundIssue.roundType || roundIssue.rating) ok = false;

    for (const question of round.questions ?? []) {
      const qIssue: QuestionIssues = {
        prose: !question.prose || question.prose.trim().length === 0,
        tags: activeTagCount(question.tags) < 1,
      };
      if (qIssue.prose || qIssue.tags) ok = false;
      roundIssue.questions.push(qIssue);
    }
    issues.rounds.push(roundIssue);
  }

  if (!ok) return { ok: false, issues };

  // Narrow to the ready-to-write shape (assertions guarded above).
  const data2: FinalSubmission = {
    company: draft.company!,
    role: draft.role!,
    level: draft.level ?? NA_LEVEL,
    outcome: draft.outcome ?? null,
    month: draft.month ?? currentMonth(),
    attribution: draft.attribution,
    rounds: rounds.map((round) => ({
      roundType: round.roundType!,
      rating: round.rating!,
      experience: round.experience?.trim() ? round.experience.trim() : null,
      questions: (round.questions ?? []).map((question) => ({
        prose: question.prose!.trim(),
        tags: question.tags,
      })),
    })),
  };
  return { ok: true, data: data2 };
}

export type CompanySelection = z.infer<typeof companySelectionSchema>;
export type CompanySuggestion = z.infer<typeof companySuggestionSchema>;
export type RoleSelection = z.infer<typeof roleSelectionSchema>;
export type LevelSelection = z.infer<typeof levelSelectionSchema>;
export type ReportOutcome = z.infer<typeof outcomeSchema>;
export type DisplayAttribution = z.infer<typeof attributionSchema>;
export type RoundType = z.infer<typeof roundTypeSchema>;
export type RoundRating = z.infer<typeof roundRatingSchema>;
export type TopicTagSelection = z.infer<typeof topicTagSelectionSchema>;
export type TopicSuggestion = z.infer<typeof topicSuggestionSchema>;
export type QuestionDraft = z.infer<typeof questionDraftSchema>;
export type RoundDraft = z.infer<typeof roundDraftSchema>;
export type SubmissionDraft = z.infer<typeof submissionDraftSchema>;
export type SubmissionReady = z.infer<typeof submissionReadySchema>;
