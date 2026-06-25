// Public data shapes for the moderation module (Sprint 6). The read-model row
// types each query returns, plus the audit-log input/action vocabulary. Kept
// separate from moderation.ts so the queries read as queries and the contracts
// they fulfil live in one place. Re-exported from moderation.ts, so callers
// still import these from "@fromtheloop/db".

// Mirror of the mod_action_type enum (schema/enums.ts).
export type ModActionType =
  | "approve"
  | "reject"
  | "merge"
  | "ban"
  | "delete"
  | "hide"
  | "edit_taxonomy"
  | "restore";

export type LogModActionInput = {
  // Internal users.id of the acting moderator (NOT their Clerk id).
  modUserId: string;
  actionType: ModActionType;
  // Polymorphic target — e.g. "company", "topic", "role".
  targetType: string;
  targetId: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PendingCompanyItem = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  createdAt: Date;
  suggestedByKarma: number | null;
};

export type PendingTopicItem = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  createdAt: Date;
  suggestedByKarma: number | null;
};

export type PendingRoleItem = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  // Canonical role this alias folds into, if any.
  canonicalName: string | null;
};

export type ModActionLogItem = {
  id: string;
  actionType: ModActionType;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  // Acting moderator, resolved to a human label (displayName ?? username).
  // Null only if the mod row was purged — the FK is ON DELETE RESTRICT, so in
  // practice the join always lands.
  modName: string | null;
  modKarma: number | null;
};

export type SoftDeletedItem = {
  // Composite "report:<uuid>" | "comment:<uuid>" — parsed by restoreSoftDeleted.
  id: string;
  kind: "report" | "comment";
  primary: string;
  secondary: string | null;
  author: string | null;
  deletedAt: Date;
  // Whole days left before the PII purge clears the prose (restore-able window).
  daysLeft: number;
};

export type HeldReportItem = {
  id: string;
  company: string;
  role: string;
  level: string;
  month: string;
  outcome: string | null;
  createdAt: Date;
  author: string | null;
  authorKarma: number | null;
};
