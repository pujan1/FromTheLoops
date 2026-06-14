// Moderation queue config (Sprint 6 Day 2).
//
// The lever that keeps all 7 mod queues from becoming 7 bespoke screens: a queue
// is just a row in QUEUE_CONFIGS, and <ModQueue> renders any of them. A queue
// page (Day 3+) only has to (a) fetch its items as ModQueueItem[] and (b) supply
// the server action that carries out an action on a set of ids. Everything the
// UI needs — title, the action buttons, which actions demand a reason, whether
// bulk select is on — lives here as plain data so it crosses the server→client
// boundary intact (no functions in config).
//
// The full design rationale (queue model + evidence storage + audit log) is
// ADR-0008 (Day 10).

import type { ReactNode } from "react";

// The 7 queues from the sprint plan. Used as the [queue] route param, so these
// double as URL slugs — keep them kebab-case and stable.
export const QUEUE_IDS = [
  "companies",
  "tags",
  "roles",
  "evidence",
  "flags",
  "soft-delete",
  "new-user-hold",
] as const;

export type QueueId = (typeof QUEUE_IDS)[number];

export function isQueueId(value: string): value is QueueId {
  return (QUEUE_IDS as readonly string[]).includes(value);
}

// Visual weight of an action button. Drives color only; the semantics live in
// `id`. `danger` = irreversible/destructive (delete), `reject`/`approve` are the
// queue verbs, `neutral` = a side action (dismiss, restore).
export type QueueActionVariant = "approve" | "reject" | "danger" | "neutral";

export type QueueAction = {
  // Stable verb the server action dispatches on (maps to a mod_action_type +
  // the queue's own handler). Not shown to the user.
  id: string;
  label: string;
  variant: QueueActionVariant;
  // When true the moderator must type a reason before the action fires — it is
  // written to mod_action_logs.reason (Section 230 hygiene: every removal is
  // justified). Defaults to false.
  requiresReason?: boolean;
  // Optional extra friction for destructive actions — a confirm() string.
  confirm?: string;
};

// A small tone vocabulary for item badges, decoupled from FtlStatusBadge's
// report-specific statuses so queues can label things ("auto-flagged", "3
// reports") without bending that component's meaning.
export type QueueBadgeTone = "neutral" | "good" | "warn" | "danger";

export type QueueBadge = {
  label: string;
  tone?: QueueBadgeTone;
};

// One row in a queue, in render-ready shape. The fetching page is responsible
// for turning a DB row into this; <ModQueue> never touches the database.
export type ModQueueItem = {
  // The id the server action receives back. Usually the target row's UUID.
  id: string;
  // Headline line (e.g. a pending company name, a flagged comment's author).
  primary: string;
  // Optional supporting line under the headline.
  secondary?: string;
  // Labelled context fields for a snap decision, rendered as a definition grid.
  fields?: { label: string; value: string }[];
  badges?: QueueBadge[];
  // Optional deep-link to inspect the underlying entity in full.
  href?: string;
  // ISO timestamp; rendered as a relative "Xm ago" age.
  createdAt?: string;
  // Optional escape hatch for rich context a queue needs that doesn't fit the
  // structured fields (e.g. a flagged comment's body). Rendered verbatim.
  detail?: ReactNode;
};

export type QueueConfig = {
  id: QueueId;
  title: string;
  // One line under the title explaining what the moderator is deciding.
  description: string;
  // Shown when the queue is empty — the happy "nothing to do" state.
  emptyText: string;
  actions: QueueAction[];
  // Whether the select-all / bulk-action affordances appear. Off for queues
  // where each item needs individual judgement (evidence review).
  bulk?: boolean;
};

// Result contract every queue's server action returns. `processed` lists the ids
// that succeeded so <ModQueue> can drop exactly those rows.
export type QueueActionResult =
  | { ok: true; processed: string[] }
  | { ok: false; error: string };

// The server action signature a queue page hands to <ModQueue>. Wired per-queue
// in app/admin/queues/[queue]/actions.ts (Day 3+).
export type QueueActionFn = (input: {
  queueId: QueueId;
  actionId: string;
  itemIds: string[];
  reason?: string;
}) => Promise<QueueActionResult>;

const APPROVE_REJECT: QueueAction[] = [
  { id: "approve", label: "Approve", variant: "approve" },
  { id: "reject", label: "Reject", variant: "reject", requiresReason: true },
];

export const QUEUE_CONFIGS: Record<QueueId, QueueConfig> = {
  companies: {
    id: "companies",
    title: "Pending companies",
    description:
      "User-suggested companies awaiting promotion. Approving makes the company canonical and lets reports referencing it enter aggregates.",
    emptyText: "No companies awaiting review.",
    actions: APPROVE_REJECT,
    bulk: true,
  },
  tags: {
    id: "tags",
    title: "Pending tags",
    description:
      "User-suggested topic tags. Pending tags don't appear in aggregates until promoted here.",
    emptyText: "No tags awaiting review.",
    actions: APPROVE_REJECT,
    bulk: true,
  },
  roles: {
    id: "roles",
    title: "Pending role aliases",
    description:
      "Role aliases proposed against a canonical role. Approve to fold the alias in; reject to discard.",
    emptyText: "No role aliases awaiting review.",
    actions: APPROVE_REJECT,
    bulk: true,
  },
  evidence: {
    id: "evidence",
    title: "Recruiter-Confirmed evidence",
    description:
      "Uploaded proof for a report's trust badge. Approving flips the report from ✓ to ✓✓. Each needs individual judgement.",
    emptyText: "No evidence awaiting review.",
    actions: [
      { id: "approve", label: "Verify", variant: "approve" },
      { id: "reject", label: "Reject", variant: "reject", requiresReason: true },
    ],
    bulk: false,
  },
  flags: {
    id: "flags",
    title: "Community flags",
    description:
      "Reader-reported reports and comments. Hide removes the content from public view; dismiss clears the flag as unfounded.",
    emptyText: "No open flags.",
    actions: [
      { id: "hide", label: "Hide", variant: "reject", requiresReason: true },
      { id: "dismiss", label: "Dismiss flag", variant: "neutral" },
      {
        id: "delete",
        label: "Delete",
        variant: "danger",
        requiresReason: true,
        confirm: "Permanently remove this content? This is logged and cannot be undone here.",
      },
    ],
    bulk: false,
  },
  "soft-delete": {
    id: "soft-delete",
    title: "Soft-delete audit",
    description:
      "Content soft-deleted in the last 90 days, before the PII purge clears it. Restore reverses an accidental or contested deletion.",
    emptyText: "Nothing in the soft-delete window.",
    actions: [{ id: "restore", label: "Restore", variant: "neutral" }],
    bulk: false,
  },
  "new-user-hold": {
    id: "new-user-hold",
    title: "New-user first submission",
    description:
      "First submissions from brand-new accounts, held for a glance before they go live.",
    emptyText: "No held submissions.",
    actions: APPROVE_REJECT,
    bulk: true,
  },
};

// Tab order for the admin shell (Day 3+).
export const QUEUE_ORDER: QueueId[] = [...QUEUE_IDS];
