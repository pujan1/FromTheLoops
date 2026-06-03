"use server";

// Edit-entry for a submitted report. Rehydrates the report into a fresh
// (temp) draft carrying its editingReportId, then sends the user into the
// normal submission flow — so "edit" reuses the entire form unchanged and the
// eventual finalize updates this report in place rather than creating a new one.
//
// Auth + ownership + the 24h window are all re-checked here: the report view
// only renders the Edit control when the window is open, but a stale page or a
// hand-crafted POST must not slip past.

import { currentUser } from "@clerk/nextjs/server";
import { reportDetailToDraft } from "@fromtheloop/core";
import {
  createDraft,
  getDb,
  getOrCreateUserByClerkId,
  getReportForEdit,
  isReportEditable,
  softDeleteReport,
} from "@fromtheloop/db";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { routes } from "@/lib/routes";

export async function startReportEdit(formData: FormData): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) notFound();

  const user = await currentUser();
  if (!user) redirect(routes.signIn);

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  // Ownership-scoped: a foreign/guessed id resolves to null → 404.
  const detail = await getReportForEdit(db, reportId, internal.id);
  if (!detail) notFound();

  // Window closed (or soft-deleted): bounce back to the report view, which
  // shows the locked state instead.
  if (!isReportEditable(detail.report)) redirect(routes.report(reportId));

  const draft = await createDraft(
    db,
    internal.id,
    reportDetailToDraft(detail) as Record<string, unknown>,
  );

  // Land on the rounds screen — basics are already valid and Submit lives
  // there. "Back to basics" (a draft resume link) covers editing the top fields.
  redirect(routes.submitRounds(draft.id));
}

// Soft-delete a report. Unlike Edit, this stays available after the 24h
// window closes — "after 24h, only Soft delete remains" (sprint exit
// criteria). Auth + ownership are enforced in softDeleteReport (scoped by
// userId); a foreign/guessed id simply matches nothing and falls through to
// the same redirect, leaking no existence signal. The report row survives
// (audit trail); status flips to 'deleted' and the view re-renders into its
// deleted state.
export async function softDeleteReportAction(
  formData: FormData,
): Promise<void> {
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) notFound();

  const user = await currentUser();
  if (!user) redirect(routes.signIn);

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  await softDeleteReport(db, reportId, internal.id);

  // Re-render the owner view with the now-deleted status instead of bouncing
  // away — the user sees their delete took effect.
  revalidatePath(routes.report(reportId));
  redirect(routes.report(reportId));
}
