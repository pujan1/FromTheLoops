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
  companySuggestionSchema,
  isHoneypotTripped,
  submissionDraftSchema,
} from "@fromtheloop/shared";
import { RATE_LIMITS, RateLimitError, rateLimit } from "@/lib/rate-limit";

export async function saveDraft(input: {
  id: string | null;
  data: unknown;
  honeypot?: string;
}): Promise<{ id: string }> {
  const user = await currentUser();
  if (!user) throw new Error("saveDraft: unauthenticated");

  // Per-user budget before any DB work. Keyed on the Clerk id so the limit
  // applies even under a flood that never resolves to our users row. Generous
  // here — autosave is legitimately frequent — so this only caps pathological
  // write amplification.
  const limited = await rateLimit(RATE_LIMITS.saveDraft, user.id);
  if (!limited.ok) throw new RateLimitError(RATE_LIMITS.saveDraft);

  // A non-empty honeypot means a bot filled a field no real user can reach.
  // Silently refuse to persist — return a benign-looking response without
  // writing, so the trap stays invisible to the bot.
  if (isHoneypotTripped(input.honeypot)) {
    return { id: input.id ?? "" };
  }

  // Reject malformed payloads (defends the jsonb column from arbitrary shapes).
  const parsed = submissionDraftSchema.parse(input.data) as Record<
    string,
    unknown
  >;

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  // Update in place when we already have a draft id we own; otherwise (new
  // form, or a stale/foreign id) create a fresh draft.
  if (input.id) {
    const updated = await updateDraft(db, input.id, internal.id, parsed);
    if (updated) return { id: updated.id };
  }
  const created = await createDraft(db, internal.id, parsed);
  return { id: created.id };
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
}): Promise<{ id: string; name: string } | null> {
  const user = await currentUser();
  if (!user) throw new Error("suggestPendingCompany: unauthenticated");

  // Tight per-user budget: this is the only surface that writes into the human
  // moderation queue, so it's the one most worth throttling. Checked before the
  // honeypot/DB so a flood is rejected cheaply.
  const limited = await rateLimit(RATE_LIMITS.suggestCompany, user.id);
  if (!limited.ok) throw new RateLimitError(RATE_LIMITS.suggestCompany);

  if (isHoneypotTripped(input.honeypot)) return null;

  const { name } = companySuggestionSchema.parse(input);

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  const { company } = await suggestCompany(db, {
    name,
    suggestedByUserId: internal.id,
  });
  return { id: company.id, name: company.name };
}
