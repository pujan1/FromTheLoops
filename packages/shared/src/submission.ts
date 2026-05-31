// Zod validators for the interview-report submission form (Sprint 1).
//
// Two shapes for the same fields:
//   - submissionDraftSchema  — everything nullish. Backs the server-side
//     autosave (Day 6 persists this as submission_drafts.data jsonb), so a
//     half-filled form is always valid to store.
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

export const outcomeSchema = z.enum(REPORT_OUTCOMES);
export const attributionSchema = z.enum(DISPLAY_ATTRIBUTIONS);

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
export type RoleSelection = z.infer<typeof roleSelectionSchema>;
export type LevelSelection = z.infer<typeof levelSelectionSchema>;
export type ReportOutcome = z.infer<typeof outcomeSchema>;
export type DisplayAttribution = z.infer<typeof attributionSchema>;
export type SubmissionDraft = z.infer<typeof submissionDraftSchema>;
export type SubmissionReady = z.infer<typeof submissionReadySchema>;
