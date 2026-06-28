// After adding a value: regenerate the migration, update tests/types.test.ts,
// and docs/data-model.md if a persisted contract changed.

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
  "rejected", // mod-rejected hold; distinct from author 'deleted' (not in restore queue)
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

// merged redirects via merged_into_id. Rejected rows are kept, not deleted
// (reports FK ON DELETE RESTRICT; surfaces filter status='active').
export const taxonomyStatus = pgEnum("taxonomy_status", [
  "active",
  "pending",
  "merged",
  "rejected",
]);

export const taxonomySource = pgEnum("taxonomy_source", [
  "seed_curated",
  "user_suggested",
]);

// Canonical IC tier a per-company level maps to (Meta "E5" → "Senior … (E5)").
// Nullable column: unmapped levels render with no prefix. mid = baseline.
export const levelTier = pgEnum("level_tier", [
  "junior",
  "mid",
  "senior",
  "staff",
  "senior_staff",
  "principal",
]);

// Display labels + section order live in lib/topic-categories.ts, keyed on these
// slugs. Nullable column → "Other" bucket until a mod assigns one.
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
  "delete", // author soft-delete
  "hide", // mod removal (distinct from author 'delete')
  "edit_taxonomy",
  "restore", // mod reverses a soft-delete
]);

// Polymorphic: no FK on content_flags.target_id (spans reports + comments).
export const contentFlagTarget = pgEnum("content_flag_target", [
  "report",
  "comment",
]);

export const contentFlagReason = pgEnum("content_flag_reason", [
  "spam",
  "harassment",
  "pii",
  "misinformation",
  "off_topic",
  "other",
]);

// The flag's own lifecycle, separate from the content's.
export const contentFlagStatus = pgEnum("content_flag_status", [
  "open",
  "actioned",
  "dismissed",
]);

// Non-active rows are kept so replies/quotes can render a placeholder and the
// PII purge can clear the body.
export const commentStatus = pgEnum("comment_status", [
  "active",
  "hidden",
  "deleted",
]);
