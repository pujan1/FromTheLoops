"use server";

// Dashboard mutations. Today: discard an in-progress draft from the resume
// list. Auth + ownership are enforced here, never trusted from the client —
// deleteDraft is scoped by (id, userId), so a guessed/foreign draft id matches
// nothing and falls through to the same redirect, leaking no existence signal.

import { currentUser } from "@clerk/nextjs/server";
import { deleteDraft, getDb, getOrCreateUserByClerkId } from "@fromtheloop/db";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { routes } from "@/lib/routes";

export async function discardDraftAction(formData: FormData): Promise<void> {
  const draftId = String(formData.get("draftId") ?? "");
  if (!draftId) notFound();

  const user = await currentUser();
  if (!user) redirect(routes.signIn);

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  // Ownership-scoped delete: a no-op when the id isn't the caller's own.
  await deleteDraft(db, draftId, internal.id);

  // Re-render the dashboard without the discarded draft.
  revalidatePath(routes.dashboard);
  redirect(routes.dashboard);
}
