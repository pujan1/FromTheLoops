"use server";

// Submission-draft autosave. Called from the client form's debounced effect.
// Auth + ownership are enforced here, not trusted from the client: we resolve
// the Clerk principal to our internal users.id and scope every write to it.
// `data` is validated against the shared draft schema before it touches the
// jsonb column.

import { currentUser } from "@clerk/nextjs/server";
import {
  createDraft,
  getDb,
  getOrCreateUserByClerkId,
  suggestCompany,
  updateDraft,
} from "@fromtheloop/db";
import {
  ACTION_ERROR,
  type ActionResult,
  actionError,
  actionOk,
  companySuggestionSchema,
  isHoneypotTripped,
  submissionDraftSchema,
} from "@fromtheloop/shared";
import { RATE_LIMITS, RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";

export async function saveDraft(input: {
  id: string | null;
  data: unknown;
  honeypot?: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await currentUser();
  if (!user) {
    return actionError(ACTION_ERROR.unauthenticated, "You must be signed in.");
  }

  // Per-user budget before any DB work. Keyed on the Clerk id so the limit
  // applies even under a flood that never resolves to our users row. Generous
  // here — autosave is legitimately frequent — so this only caps pathological
  // write amplification.
  const limited = await rateLimit(RATE_LIMITS.saveDraft, user.id);
  if (!limited.ok) {
    return actionError(ACTION_ERROR.rateLimited, RATE_LIMIT_MESSAGE);
  }

  // A non-empty honeypot means a bot filled a field no real user can reach.
  // Silently refuse to persist but return a benign success — an empty id, the
  // same shape a first save yields — so the trap stays invisible to the bot.
  if (isHoneypotTripped(input.honeypot)) {
    return actionOk({ id: input.id ?? "" });
  }

  // Reject malformed payloads (defends the jsonb column from arbitrary shapes).
  const parsed = submissionDraftSchema.safeParse(input.data);
  if (!parsed.success) {
    return actionError(ACTION_ERROR.invalid, "Draft data was malformed.");
  }
  const data = parsed.data as Record<string, unknown>;

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  // Update in place when we already have a draft id we own; otherwise (new
  // form, or a stale/foreign id) create a fresh draft.
  if (input.id) {
    const updated = await updateDraft(db, input.id, internal.id, data);
    if (updated) return actionOk({ id: updated.id });
  }
  const created = await createDraft(db, internal.id, data);
  return actionOk({ id: created.id });
}

// Promote a "suggest new" company to a real taxonomy row. Called at the
// Continue boundary when the chosen company is a suggestion with no row yet.
// suggestCompany inserts it as status='pending' / source='user_suggested'
// (idempotent on slug — never flips an active row to pending) and attributes
// it to the suggester. Returns the row id+name so the client backfills the
// selection (suggested → existing) before it advances/persists. Returns null
// when the honeypot is tripped.
export async function suggestPendingCompany(input: {
  name: string;
  honeypot?: string;
}): Promise<ActionResult<{ id: string; name: string } | null>> {
  const user = await currentUser();
  if (!user) {
    return actionError(ACTION_ERROR.unauthenticated, "You must be signed in.");
  }

  // Tight per-user budget: this is the only surface that writes into the human
  // moderation queue, so it's the one most worth throttling. Checked before the
  // honeypot/DB so a flood is rejected cheaply.
  const limited = await rateLimit(RATE_LIMITS.suggestCompany, user.id);
  if (!limited.ok) {
    return actionError(ACTION_ERROR.rateLimited, RATE_LIMIT_MESSAGE);
  }

  // Honeypot tripped: succeed with no suggestion (data: null) rather than
  // surface an error, keeping the trap invisible.
  if (isHoneypotTripped(input.honeypot)) return actionOk(null);

  const parsed = companySuggestionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(ACTION_ERROR.invalid, "That company name isn't valid.");
  }

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  const { company } = await suggestCompany(db, {
    name: parsed.data.name,
    suggestedByUserId: internal.id,
  });
  return actionOk({ id: company.id, name: company.name });
}
