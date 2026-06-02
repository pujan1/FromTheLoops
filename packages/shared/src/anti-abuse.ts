// Submission anti-abuse (Sprint 1 Day 8).
//
// Two layers guard the only data-creation surface in V1:
//   1. Clerk Smart CAPTCHA at the account boundary — you cannot reach
//      /submit without a Clerk account, and account creation is Turnstile-
//      gated. So every submitter has already cleared a captcha; we don't
//      bolt a second one onto the form itself (see the Sprint 1 Day 8 note
//      in sprints/sprint-01-submission-form.md for the boundary rationale).
//   2. A honeypot field on the submit form — a decoy input hidden from real
//      users (off-screen, aria-hidden, tabindex -1, autocomplete off) that
//      naive bots auto-fill. The saveDraft server action calls
//      isHoneypotTripped() and silently refuses to persist when it's set,
//      without revealing the trap.
//
// The field name is deliberately plausible ("website") so form-filling bots
// target it; a human never sees or focuses it, so any non-empty value is a
// strong bot signal.

export const HONEYPOT_FIELD = "website" as const;

// True when the honeypot carries any non-whitespace content — i.e. something
// (a bot) typed into a field no human can reach. Anything that isn't a
// non-empty string (undefined, null, "", "   ", numbers) is treated as
// untripped so a missing/blank field from a legitimate client never rejects.
export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
