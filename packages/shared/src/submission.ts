// Zod validators for the interview-report submission form.
//
// Two shapes for the same fields:
//   - submissionDraftSchema  — everything nullish. Backs the server-side
//     autosave (persisted as submission_drafts.data jsonb), so a half-filled
//     form is always valid to store.
//   - submissionReadySchema  — the gate for "Continue → Rounds": company,
//     role, level, and month must be present. outcome stays optional.
//
// The enum value sets mirror packages/db enums (report_outcome,
// display_attribution) — kept as plain const tuples here so the web layer
// can validate without importing the db package.

import { z } from "zod";

export const REPORT_OUTCOMES = [
  "offer",
  "reject",
  "withdrew",
  "ghosted",
  "pending",
] as const;

export const DISPLAY_ATTRIBUTIONS = ["display_name", "anonymous"] as const;

// Mirror packages/db enums round_type / round_rating. Plain tuples so the
// web layer validates rounds without importing the db package (same pattern
// as REPORT_OUTCOMES above).
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

// Per-submission caps: a single submission transaction shouldn't grow
// unbounded. Well over any realistic interview loop; surfaced in form copy and
// enforced by the UI add buttons + the finalize validator.
export const MAX_ROUNDS = 20;
export const MAX_QUESTIONS_PER_ROUND = 30;

export const outcomeSchema = z.enum(REPORT_OUTCOMES);
export const attributionSchema = z.enum(DISPLAY_ATTRIBUTIONS);
export const roundTypeSchema = z.enum(ROUND_TYPES);
export const roundRatingSchema = z.enum(ROUND_RATINGS);

// Company selection is a discriminated union: an existing taxonomy row
// (has a uuid) OR a user suggestion (name only — the submit action creates
// it as status='pending' via suggestCompany, then backfills the id).
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

// Input for the "suggest a new company" server action — just the typed name,
// bounded the same way as the suggested arm of companySelectionSchema. The
// action turns this into a status='pending' taxonomy row.
export const companySuggestionSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

// Roles are a closed canonical set — no inline create, so existing-only.
export const roleSelectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
});

// A per-company level, or the "N/A" sentinel (id = null) for companies with
// no ladder yet. `name` is what lands in interview_reports.level (text).
export const levelSelectionSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().min(1),
});

// A topic tag on a question. Same existing-vs-suggested discriminated union
// as company selection: an "existing" tag is a curated/active topic (uuid),
// a "suggested" tag is a user-proposed name the finalize step turns into a
// status='pending' topic via suggestTopic. Only "existing" (active) tags
// count toward the ≥1-tag-per-question rule; a suggestion is parked until a
// mod promotes it.
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

// Input for the "suggest a new tag" server action, bounded like the suggested
// arm above.
export const topicSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

// A single interview question. Draft-tolerant: prose may be blank and tags
// may be empty while the user is still typing. The finalize gate requires
// non-empty prose + ≥1 active tag.
export const questionDraftSchema = z.object({
  prose: z.string().nullish(),
  tags: z.array(topicTagSelectionSchema).default([]),
});

// A single round. Draft-tolerant: type/rating may be unset mid-edit. The
// finalize gate requires round_type + rating once rounds.length > 0.
export const roundDraftSchema = z.object({
  roundType: roundTypeSchema.nullish(),
  rating: roundRatingSchema.nullish(),
  experience: z.string().nullish(),
  questions: z.array(questionDraftSchema).default([]),
});

// Interview month, "YYYY-MM". The form defaults it to the current month.
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected a YYYY-MM month");

// "YYYY-MM" for the current month. The finalize gate falls back to this when a
// submission carries no month (the field is optional — many candidates submit
// before/without pinning the exact month). Server-side clock; mirrors the web
// form's currentMonth() helper.
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// The sentinel level for a submission with no level chosen. Level is optional
// (a candidate may interview before the level is decided), but the DB column is
// NOT NULL and the wedge index is built on it — so a missing level resolves to
// this "N/A" text with a null FK, exactly like a company with no ladder. Mirrors
// the web form's NA_LEVEL.
export const NA_LEVEL: LevelSelection = { id: null, name: "N/A" };

// Draft: tolerant of a partially-filled form. attribution keeps a default
// so a brand-new draft still has a sane privacy posture (anonymous).
export const submissionDraftSchema = z.object({
  company: companySelectionSchema.nullish(),
  role: roleSelectionSchema.nullish(),
  level: levelSelectionSchema.nullish(),
  outcome: outcomeSchema.nullish(),
  month: monthSchema.nullish(),
  attribution: attributionSchema.default("anonymous"),
  // Rounds substrate. Nullish so an older draft (no rounds key) still parses;
  // the rounds form defaults it to []. Capped at MAX_ROUNDS — a draft that
  // somehow exceeds the cap is rejected rather than silently truncated.
  rounds: z.array(roundDraftSchema).max(MAX_ROUNDS).nullish(),
  // Set only when this draft is an in-flight *edit* of an already-submitted
  // report (the report view rehydrates a report into a temp draft with this
  // set). Finalization branches on it: present → update that report in place;
  // absent → create a new report. Nullish so every ordinary new-submission
  // draft (which never carries it) still parses.
  editingReportId: z.string().uuid().nullish(),
});

// Ready-to-continue: the required top-level fields are present. Only company
// and role are required. outcome, level and month are all optional — a
// candidate may be mid-process (no outcome), may have interviewed before the
// level was decided (no level), or may not want to pin an exact month. The
// finalize gate fills level/month with sane defaults (NA_LEVEL / currentMonth).
export const submissionReadySchema = z.object({
  company: companySelectionSchema,
  role: roleSelectionSchema,
  level: levelSelectionSchema.nullish(),
  outcome: outcomeSchema.nullable(),
  month: monthSchema.nullish(),
  attribution: attributionSchema,
});

// ---------------------------------------------------------------------------
// Finalize validation (Sprint 2 Day 4)
//
// The draft schema is deliberately permissive — it has to store a half-filled
// form. Finalization is the opposite: the strict gate the submission
// transaction (Day 5) runs server-side before it writes anything. Rules:
//   - 0 rounds is allowed (a recruiter-screen-only "got rejected, no detail"
//     report is legitimate).
//   - If a round exists it must have a round_type AND a rating.
//   - Each question needs non-blank prose AND ≥1 *active* tag. A "suggested"
//     (pending) tag does NOT count — it's parked until a mod promotes it.
//   - Only company / role must be present. outcome, level and month are
//     optional: a candidate may be mid-process (no outcome), may have
//     interviewed before the level was decided (no level), or may not pin a
//     month. A missing level resolves to NA_LEVEL, a missing month to the
//     current month — so the NOT NULL columns always get a value.
//
// validateFinalSubmission is the single authority. It returns either the
// narrowed, ready-to-write FinalSubmission or a structured issue map the form
// renders inline (booleans, not copy — the web layer owns the wording/i18n).

export interface FinalQuestion {
  prose: string;
  // All selected tags (existing + suggested). ≥1 is guaranteed to be
  // "existing"; suggested tags are resolved to pending rows at finalize.
  tags: TopicTagSelection[];
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

// true = this field is in error (missing/invalid). Mirrors the form's shape so
// a card can light up exactly the controls that need attention.
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
  // level and month are optional at finalize (defaulted, never flagged). The
  // keys stay for shape stability but are always false.
  level: boolean;
  month: boolean;
  rounds: RoundIssues[];
  // The payload didn't even parse as a draft (arbitrary/corrupt shape). When
  // set, the per-field flags are not meaningful.
  malformed?: boolean;
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

// Server-side finalize gate. Accepts the raw draft payload (the jsonb we
// stored), re-parses it with the tolerant draft schema, then applies the strict
// finalize rules in code — clearer than threading cross-field/per-index rules
// through Zod refinements. Returns the narrowed FinalSubmission on success.
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
  // level and month are optional — missing values are defaulted below, never
  // flagged as errors.

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

  // All rules passed — narrow to the ready-to-write shape. The non-null
  // assertions are guarded by the checks above.
  const data2: FinalSubmission = {
    company: draft.company!,
    role: draft.role!,
    // Optional → defaulted: no level means "N/A", no month means this month.
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
