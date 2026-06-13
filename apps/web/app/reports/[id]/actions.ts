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
  type FlagRefusal,
  flagReportHelpful,
  getDb,
  getOrCreateUserByClerkId,
  getReportForEdit,
  hasUserFlaggedReport,
  isReportEditable,
  softDeleteReport,
  unflagReportHelpful,
} from "@fromtheloop/db";
import { revalidatePath, revalidateTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { reportDetailTag } from "@/lib/report-detail-cache";
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

  // Drop the cached triage-peek body in lockstep: a deleted report must 404 the
  // pane's /api/reports/:id read, not serve a stale cached body (ADR-0010).
  revalidateTag(reportDetailTag(reportId));

  // Re-render the owner view with the now-deleted status instead of bouncing
  // away — the user sees their delete took effect.
  revalidatePath(routes.report(reportId));
  redirect(routes.report(reportId));
}

// The state the helpful-flag button renders, threaded through useActionState:
// the viewer's current flag state, the live count, and a refusal reason to
// surface (e.g. rate-limited) — null when the last toggle succeeded.
export interface HelpfulFlagState {
  flagged: boolean;
  count: number;
  error: FlagRefusal | "not_signed_in" | null;
}

// Toggle the viewer's helpful-flag on a report. Decides flag-vs-unflag from the
// DB truth (not the client's claimed state), so a double-submit or a stale page
// can't desync. Every guard (auth, self-flag, verified, rate limit) is enforced
// in the db layer; this action just resolves the viewer and surfaces the
// outcome. revalidatePath refreshes the SSR count for the next load while
// useActionState updates the button in place now.
export async function toggleHelpfulFlagAction(
  _prev: HelpfulFlagState,
  formData: FormData,
): Promise<HelpfulFlagState> {
  const reportId = String(formData.get("reportId") ?? "");
  const count = Number(formData.get("count") ?? 0);
  const flagged = formData.get("flagged") === "1";
  if (!reportId) return { flagged, count, error: "not_found" };

  const user = await currentUser();
  if (!user) return { flagged, count, error: "not_signed_in" };

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  if (await hasUserFlaggedReport(db, reportId, internal.id)) {
    const res = await unflagReportHelpful(db, {
      reportId,
      flaggerUserId: internal.id,
    });
    revalidatePath(routes.report(reportId));
    return { flagged: false, count: res.count, error: null };
  }

  const res = await flagReportHelpful(db, {
    reportId,
    flaggerUserId: internal.id,
  });
  revalidatePath(routes.report(reportId));
  if (res.ok) return { flagged: true, count: res.count, error: null };
  return { flagged, count, error: res.reason };
}
