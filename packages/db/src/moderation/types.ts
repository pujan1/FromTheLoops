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
  modUserId: string; // internal users.id, not the Clerk id
  actionType: ModActionType;
  targetType: string; // "company" | "topic" | "role" | ...
  targetId: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

// `score` is pg_trgm similarity (0..1).
export type DedupHint = {
  name: string;
  score: number;
};

export type PendingCompanyItem = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  createdAt: Date;
  suggestedByKarma: number | null;
  nearest: DedupHint | null;
};

export type PendingTopicItem = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  createdAt: Date;
  suggestedByKarma: number | null;
  nearest: DedupHint | null;
};

export type PendingRoleItem = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  canonicalName: string | null; // role this alias folds into, if any
};

export type ModActionLogItem = {
  id: string;
  actionType: ModActionType;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  modName: string | null;
  modKarma: number | null;
};

export type SoftDeletedItem = {
  id: string; // composite "report:<uuid>" | "comment:<uuid>"
  kind: "report" | "comment";
  primary: string;
  secondary: string | null;
  author: string | null;
  deletedAt: Date;
  daysLeft: number; // days left in the restore-able window before PII purge
};

export type AutoApprovalItem = {
  id: string;
  targetType: string;
  targetId: string;
  name: string | null;
  reasons: string[];
  createdAt: Date;
};

export type ContentFlagItem = {
  id: string; // composite "report:<uuid>" | "comment:<uuid>"
  kind: "report" | "comment";
  primary: string;
  secondary: string | null;
  author: string | null; // author of the content, not the flagger
  href: string;
  flagCount: number; // distinct readers who flagged this
  reasons: string[];
  firstFlaggedAt: Date;
  lastFlaggedAt: Date;
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
