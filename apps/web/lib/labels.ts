// Display labels for the report enums (outcome, round type) — the one place the
// wire values (`onsite-system-design`, `withdrew`) become human copy. The browse
// surfaces (wedge Position Y + X, filter bar) all read from here so a label is
// defined once. Keyed on the shared enums so a new value is a compile error,
// not a silently-unlabeled chip.

import type { BadgeStatus } from "@/components/ui";
import type { ReportOutcome, RoundType } from "@fromtheloop/shared";

export const OUTCOME_LABEL: Record<ReportOutcome, string> = {
  offer: "Offer",
  reject: "Reject",
  withdrew: "Withdrew",
  ghosted: "Ghosted",
  pending: "Pending",
};

// Outcome → the StatusBadge severity it reads as. Offer is the only clear
// "good"; reject is the clear "bad"; ghosted is a soft-negative (warning);
// withdrew/pending are neutral states.
export const OUTCOME_BADGE: Record<ReportOutcome, BadgeStatus> = {
  offer: "success",
  reject: "danger",
  withdrew: "neutral",
  ghosted: "warning",
  pending: "pending",
};

export const ROUND_TYPE_LABEL: Record<RoundType, string> = {
  "recruiter-screen": "Recruiter screen",
  "technical-phone": "Technical phone",
  "onsite-coding": "Onsite coding",
  "onsite-system-design": "System design",
  "onsite-behavioral": "Behavioral",
  "take-home": "Take-home",
  "hiring-manager": "Hiring manager",
  "exec-final": "Exec / final",
  other: "Other",
};

// Label a round type, falling back to a de-hyphenated form for any value not in
// the map (e.g. a future enum member rendered by older client code).
export function roundTypeLabel(roundType: string): string {
  return (
    ROUND_TYPE_LABEL[roundType as RoundType] ?? roundType.replace(/-/g, " ")
  );
}

// Label an outcome; `null`/unknown render as "Outcome pending".
export function outcomeLabel(outcome: string | null): string {
  if (!outcome) return "Outcome pending";
  return OUTCOME_LABEL[outcome as ReportOutcome] ?? outcome;
}
