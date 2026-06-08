"use server";

// Settings mutations. Auth + ownership are enforced here, never trusted from
// the client: every action resolves the signed-in Clerk principal to its
// internal user id and scopes the write to that id.

import { clerkClient, currentUser } from "@clerk/nextjs/server";
import {
  deleteUserAccount,
  getDb,
  getOrCreateUserByClerkId,
  updateUserSettings,
} from "@fromtheloop/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";

// Display name is optional; cap the length so it can't be abused as a
// free-text overflow. Empty → cleared (the data layer normalizes "" to null).
const MAX_DISPLAY_NAME = 80;

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect(routes.signIn);

  const rawDisplayName = String(formData.get("displayName") ?? "");
  const rawAttribution = String(formData.get("defaultDisplayAttribution") ?? "");

  // Whitelist the enum value; anything else is dropped rather than trusted.
  const defaultDisplayAttribution =
    rawAttribution === "display_name" || rawAttribution === "anonymous"
      ? rawAttribution
      : undefined;

  if (rawDisplayName.trim().length > MAX_DISPLAY_NAME) {
    redirect(`${routes.settings}?error=name-too-long`);
  }

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  await updateUserSettings(db, internal.id, {
    displayName: rawDisplayName,
    defaultDisplayAttribution,
  });

  revalidatePath(routes.settings);
  redirect(`${routes.settings}?saved=1`);
}

// Account deletion. Two-sided: (1) soft-delete the internal account + its
// reports (deleteUserAccount), so public content drops immediately and the
// 90-day PII sweeps take over; (2) delete the Clerk user, which revokes every
// session — the "immediately signed out" half. We delete Clerk LAST: if step 1
// fails we haven't orphaned the auth principal, and Clerk deletion invalidating
// the session is what makes the redirect below land on a signed-out home page.
export async function deleteAccountAction(formData: FormData): Promise<void> {
  // Require the typed confirmation token from the form — a guard against a
  // stray/forged submit reaching this irreversible path.
  const confirm = String(formData.get("confirm") ?? "");
  if (confirm !== "DELETE") {
    redirect(`${routes.settingsDelete}?error=confirm`);
  }

  const user = await currentUser();
  if (!user) redirect(routes.signIn);

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  await deleteUserAccount(db, internal.id);

  // Revoke the auth principal + all sessions. Best-effort: if Clerk deletion
  // fails the account is already soft-deleted locally; surfacing the error
  // would only strand the user on a half-deleted account, so we proceed to the
  // signed-out landing either way (a stale session can't act on a soft-deleted
  // account meaningfully, and the next sign-in attempt will fail).
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(user.id);
  } catch {
    // swallow — local soft-delete already happened; see comment above.
  }

  redirect(`${routes.home}?deleted=1`);
}
