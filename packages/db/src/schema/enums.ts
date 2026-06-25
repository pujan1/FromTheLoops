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
//   3. Update docs/data-model.md if this changes a persisted model contract.

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
  // `rejected` (Sprint 6 Day 7): a moderator rejected a held first-submission.
  // Like the author-soft-delete 'deleted', it drops out of every public surface
  // (all filter status='active'), but it's kept DISTINCT from 'deleted' so it
  // stays out of the soft-delete *restore* queue (that's for author deletions)
  // and reads as a moderation decision in the audit log. Reversible only by an
  // admin via the audit/moderation path, not the public restore flow.
  "rejected",
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

// Lifecycle of a taxonomy row. active = shown in autocomplete; pending =
// user-suggested, mod-queue only; merged = superseded, redirects via
// merged_into_id; rejected = a moderator declined a pending suggestion
// (Sprint 6 Day 3). Rejected rows are kept (not deleted) because reports FK to
// taxonomy with ON DELETE RESTRICT — and because every surface already filters
// status='active', a rejected row drops out of search/aggregates/queues with no
// extra predicate. See PLAN.md §Taxonomy curation.
export const taxonomyStatus = pgEnum("taxonomy_status", [
  "active",
  "pending",
  "merged",
  "rejected",
]);

// Provenance of a taxonomy row. Separate from report_source (different
// value set: user_suggested vs user_submitted).
export const taxonomySource = pgEnum("taxonomy_source", [
  "seed_curated",
  "user_suggested",
]);

// Canonical IC seniority tier a per-company level maps to. Lets the submission
// UI render a company-specific level (Meta "E5", Google "L5") as a standard
// role label ("Senior Frontend Engineer (E5)"). Nullable on the column: a
// user-suggested level or an un-mapped ladder rung simply renders with no
// seniority prefix. mid = the baseline IC tier (no prefix). See PLAN.md
// §Taxonomy curation.
export const levelTier = pgEnum("level_tier", [
  "junior",
  "mid",
  "senior",
  "staff",
  "senior_staff",
  "principal",
]);

// Curated grouping a topic belongs to, driving the /topics index's
// "grouped by category" sections (Sprint 5). The value set mirrors the comment
// groups in seed/curated.ts CURATED_TOPICS. Nullable on the column: a
// user-suggested pending tag has no category until a mod assigns one, and falls
// into the index's "Other" bucket. Display labels + section order live in app
// code (lib/topic-categories.ts), keyed on these stable slugs.
export const topicCategory = pgEnum("topic_category", [
  "algorithms",
  "system-design",
  "fundamentals",
  "machine-learning",
  "data-engineering",
  "infrastructure",
  "behavioral",
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
  // `hide` (ADR-0011): a mod removes a comment from public view without
  // hard-deleting it. Distinct from `delete` (the author's own soft-delete) so
  // the audit log + the rendered placeholder ("removed by moderator" vs
  // "deleted") can tell the two actors apart.
  "hide",
  "edit_taxonomy",
  // `restore` (Sprint 6 Day 7): a mod reverses a soft-delete — content whose
  // status was 'deleted' goes back to 'active' and its deleted_at clears. The
  // soft-delete audit queue is the only writer. Distinct from the delete/hide
  // verbs so the audit log reads "undid a deletion", not another removal.
  "restore",
]);

// Lifecycle of a comment (ADR-0011). `active` on insert (comments post
// instantly, no pre-moderation). `hidden` = a moderator removed it from view
// (mod_action_type 'hide', logged). `deleted` = the author soft-deleted it
// (deleted_at set in the same write). Both non-active states keep the row so
// replies/quotes pointing at it can render a placeholder and the 90-day PII
// purge can clear the body.
export const commentStatus = pgEnum("comment_status", [
  "active",
  "hidden",
  "deleted",
]);
