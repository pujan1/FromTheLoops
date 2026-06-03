// New-user moderation hold — the initial-status policy for a fresh submission.
//
// Sprint 2: "New-user 24h moderation hold (drops after 3 verified
// submissions)." A brand-new account's reports are held in moderation; the
// hold lifts once the account is both past its first 24 hours AND has earned
// ≥3 verified submissions (reports flagged evidence_verified — i.e. backed by a
// verified work association). We require BOTH (the conservative reading): the
// 24h floor blocks burst-then-publish, the verified-count floor is the durable
// trust signal. A trusted submission is created 'active'; everything else stays
// 'pending_moderation' (the column default).
//
// Pure + side-effect-free so it unit-tests without a DB. In V1 nothing sets
// evidence_verified yet, so verifiedReportCount is always 0 and every report is
// held — identical to today's behavior, but the policy is now encoded for when
// Sprint 6 verification + moderation tooling arrives.

export const NEW_USER_HOLD_MS = 24 * 60 * 60 * 1000;
export const TRUSTED_VERIFIED_THRESHOLD = 3;

export type InitialReportStatus = "active" | "pending_moderation";

export interface HoldDecisionInput {
  // How long the submitting account has existed, in ms.
  accountAgeMs: number;
  // The user's count of prior verified submissions.
  verifiedReportCount: number;
}

export function decideInitialReportStatus(
  input: HoldDecisionInput,
): InitialReportStatus {
  const pastNewUserWindow = input.accountAgeMs >= NEW_USER_HOLD_MS;
  const trusted = input.verifiedReportCount >= TRUSTED_VERIFIED_THRESHOLD;
  return pastNewUserWindow && trusted ? "active" : "pending_moderation";
}
