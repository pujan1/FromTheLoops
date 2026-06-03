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
});

// Ready-to-continue: the required top-level fields are present. outcome is
// deliberately still optional (a candidate mid-process may not know it).
export const submissionReadySchema = z.object({
  company: companySelectionSchema,
  role: roleSelectionSchema,
  level: levelSelectionSchema,
  outcome: outcomeSchema.nullable(),
  month: monthSchema,
  attribution: attributionSchema,
});

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
