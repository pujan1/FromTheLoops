// Pure initial-status policy: a report is created 'active' only if the account
// is past 24h AND has ≥3 verified submissions; else 'pending_moderation'. In V1
// nothing sets evidence_verified, so every report is held.

export const NEW_USER_HOLD_MS = 24 * 60 * 60 * 1000;
export const TRUSTED_VERIFIED_THRESHOLD = 3;

export type InitialReportStatus = "active" | "pending_moderation";

export interface HoldDecisionInput {
  accountAgeMs: number;
  verifiedReportCount: number;
}

export function decideInitialReportStatus(
  input: HoldDecisionInput,
): InitialReportStatus {
  const pastNewUserWindow = input.accountAgeMs >= NEW_USER_HOLD_MS;
  const trusted = input.verifiedReportCount >= TRUSTED_VERIFIED_THRESHOLD;
  return pastNewUserWindow && trusted ? "active" : "pending_moderation";
}
