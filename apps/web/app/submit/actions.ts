"use server";

// Submission-draft autosave (Sprint 1 Day 6). Called from the client form's
// debounced effect. Auth + ownership are enforced here, not trusted from the
// client: we resolve the Clerk principal to our internal users.id and scope
// every write to it. `data` is validated against the shared draft schema
// before it touches the jsonb column.

import { currentUser } from "@clerk/nextjs/server";
import {
  createDraft,
  getDb,
  getOrCreateUserByClerkId,
  updateDraft,
} from "@fromtheloop/db";
import { isHoneypotTripped, submissionDraftSchema } from "@fromtheloop/shared";

export async function saveDraft(input: {
  id: string | null;
  data: unknown;
  honeypot?: string;
}): Promise<{ id: string }> {
  const user = await currentUser();
  if (!user) throw new Error("saveDraft: unauthenticated");

  // Anti-abuse (Day 8): a non-empty honeypot means a bot filled a field no
  // real user can reach. Silently refuse to persist — return a benign-looking
  // response without writing, so the trap stays invisible to the bot. A
  // legitimate client always sends this empty, so this never fires for humans.
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
