// Honeypot field for the submit form: a decoy input hidden from humans that
// bots auto-fill. saveDraft silently refuses when it's set. (Account creation is
// already Clerk-captcha-gated, so this is the only form-level guard.)

export const HONEYPOT_FIELD = "website" as const;

// True when the field carries non-whitespace content (only a bot could fill it).
export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
