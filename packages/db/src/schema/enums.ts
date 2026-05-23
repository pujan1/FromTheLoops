// All pgEnum definitions live here, one source of truth.
//
// Why pgEnum and not text + check constraint:
//   - The database itself rejects bogus values (asserted in
//     tests/constraints.test.ts via SQLSTATE 22P02).
//   - TypeScript gets the exact discriminated union for free
//     (asserted in tests/types.test.ts via expectTypeOf).
//   - Adding a value is a single migration; renaming requires care
//     (ALTER TYPE ... RENAME VALUE; cannot drop values without recreating
//     the type).
//
// If you add a value here:
//   1. Regenerate the migration (`pnpm --filter @fromtheloop/db generate`)
//   2. Update the matching union in tests/types.test.ts
//   3. Update PLAN.md §Data model if this is a wedge-relevant enum

import { pgEnum } from "drizzle-orm/pg-core";

export const reportSource = pgEnum("report_source", [
  "seed_dummy",
  "seed_curated",
  "user_submitted",
  "imported",
]);

export const reportStatus = pgEnum("report_status", [
  "active",
  "pending_moderation",
  "deleted",
]);

export const reportOutcome = pgEnum("report_outcome", [
  "offer",
  "reject",
  "withdrew",
  "ghosted",
  "pending",
]);

export const displayAttribution = pgEnum("display_attribution", [
  "display_name",
  "anonymous",
]);

export const roundType = pgEnum("round_type", [
  "recruiter-screen",
  "technical-phone",
  "onsite-coding",
  "onsite-system-design",
  "onsite-behavioral",
  "take-home",
  "hiring-manager",
  "exec-final",
  "other",
]);

export const roundRating = pgEnum("round_rating", [
  "positive",
  "mixed",
  "negative",
]);

export const verificationMethod = pgEnum("verification_method", [
  "work_email",
  "linkedin",
  "manual",
]);

export const modActionType = pgEnum("mod_action_type", [
  "approve",
  "reject",
  "merge",
  "ban",
  "delete",
  "edit_taxonomy",
]);
