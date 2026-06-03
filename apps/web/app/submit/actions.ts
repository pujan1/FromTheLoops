"use server";

// Submission-draft autosave. Called from the client form's debounced effect.
// Auth + ownership are enforced here, not trusted from the client: we resolve
// the Clerk principal to our internal users.id and scope every write to it.
// `data` is validated against the shared draft schema before it touches the
// jsonb column.

import { currentUser } from "@clerk/nextjs/server";
import { finalizeSubmission } from "@fromtheloop/core";
import {
  createDraft,
  EDIT_WINDOW_MS,
  getDb,
  getDraft,
  getOrCreateUserByClerkId,
  getReportForEdit,
  suggestCompany,
  suggestTopic,
  updateDraft,
} from "@fromtheloop/db";
import {
  ACTION_ERROR,
  type ActionResult,
  actionError,
  actionOk,
  companySuggestionSchema,
  EMAIL_JOB,
  type EmailJobData,
  isHoneypotTripped,
  submissionDraftSchema,
  topicSuggestionSchema,
} from "@fromtheloop/shared";
import { renderSubmissionConfirmedEmail } from "@/emails/submission-confirmed";
import { getNotificationsQueue } from "@/lib/queue";
import {
  RATE_LIMITS,
  RATE_LIMIT_MESSAGE,
  rateLimit,
  slidingWindowRateLimit,
} from "@/lib/rate-limit";
import { routes } from "@/lib/routes";

// Render + enqueue the submission-confirmed email. Best-effort and fully
// self-contained (own try/catch): the report is already persisted, so nothing
// here may throw into the submission's success path. No-ops without a
// recipient address.
async function enqueueSubmissionConfirmation(
  db: ReturnType<typeof getDb>,
  userId: string,
  reportId: string,
  toEmail: string | null,
): Promise<void> {
  if (!toEmail) return;
  try {
    // Ownership-scoped read for the company/role names + the edit window.
    const detail = await getReportForEdit(db, reportId, userId);
    if (!detail) return;

    const msLeft = Math.min(
      EDIT_WINDOW_MS,
      detail.report.lockedAt.getTime() - Date.now(),
    );
    const editHoursLeft = Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const { subject, html, text } = renderSubmissionConfirmedEmail({
      companyName: detail.company.name,
      roleName: detail.role.name,
      reportUrl: `${appUrl}${routes.report(reportId)}`,
      editHoursLeft,
    });

    await getNotificationsQueue().add(
      EMAIL_JOB,
      { to: toEmail, subject, html, text } satisfies EmailJobData,
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  } catch (err) {
    // Swallow — confirmation email is not worth failing a submission over.
    console.error("enqueueSubmissionConfirmation failed:", err);
  }
}

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

// Promote a "suggest new" topic tag to a real taxonomy row. The topic analogue
// of suggestPendingCompany — same shape, same fail-closed-without-tipping-off
// honeypot handling. suggestTopic inserts it as status='pending' /
// source='user_suggested' (idempotent on slug) and attributes the suggester.
// Returns the row id/slug/name so the client backfills the tag selection
// (suggested → existing) — but note the row is *pending*, so it still won't
// satisfy the ≥1-active-tag rule until a mod promotes it. Returns null when the
// honeypot is tripped.
export async function suggestPendingTopic(input: {
  name: string;
  honeypot?: string;
}): Promise<ActionResult<{ id: string; slug: string; name: string } | null>> {
  const user = await currentUser();
  if (!user) {
    return actionError(ACTION_ERROR.unauthenticated, "You must be signed in.");
  }

  // Tight per-user budget: like company suggestions, this writes into the
  // human moderation queue. Checked before the honeypot/DB so a flood is
  // rejected cheaply.
  const limited = await rateLimit(RATE_LIMITS.suggestTopic, user.id);
  if (!limited.ok) {
    return actionError(ACTION_ERROR.rateLimited, RATE_LIMIT_MESSAGE);
  }

  // Honeypot tripped: succeed with no suggestion (data: null), keeping the
  // trap invisible.
  if (isHoneypotTripped(input.honeypot)) return actionOk(null);

  const parsed = topicSuggestionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(ACTION_ERROR.invalid, "That topic name isn't valid.");
  }

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  const { topic } = await suggestTopic(db, {
    name: parsed.data.name,
    suggestedByUserId: internal.id,
  });
  return actionOk({ id: topic.id, slug: topic.slug, name: topic.name });
}

// Finalize a draft into a submitted report. The terminal action of the
// submission flow (the "Submit" button on the rounds screen). Auth + ownership
// + the submit budget are enforced here; the heavy lifting — re-validating the
// payload server-side, resolving any suggested company/tags to pending rows,
// and writing interview_report + rounds + questions + question_topics in one
// transaction (or updating in place for an edit) — lives in core's
// finalizeSubmission. Returns the new report id so the client can route to it;
// null on a tripped honeypot (a benign success that writes nothing).
export async function finalizeSubmissionAction(input: {
  draftId: string;
  honeypot?: string;
}): Promise<ActionResult<{ reportId: string } | null>> {
  const user = await currentUser();
  if (!user) {
    return actionError(ACTION_ERROR.unauthenticated, "You must be signed in.");
  }

  // Per-user submit budget before any DB work — the heaviest, most abusable
  // write surface. Sliding window so the 10/day cap can't be doubled across a
  // midnight boundary.
  const limited = await slidingWindowRateLimit(RATE_LIMITS.submitReport, user.id);
  if (!limited.ok) {
    return actionError(ACTION_ERROR.rateLimited, RATE_LIMIT_MESSAGE);
  }

  // Honeypot tripped: succeed with no report (data: null), keeping the trap
  // invisible — same fail-closed-without-tipping-off shape as the other actions.
  if (isHoneypotTripped(input.honeypot)) return actionOk(null);

  const db = getDb();
  const internal = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
  });

  // Ownership-scoped draft load: a guessed/foreign id resolves to null.
  const draft = await getDraft(db, input.draftId, internal.id);
  if (!draft) {
    return actionError(ACTION_ERROR.invalid, "We couldn't find that draft.");
  }

  // A draft rehydrated from a report carries editingReportId; finalize edits it
  // in place rather than creating a new report.
  const parsed = submissionDraftSchema.safeParse(draft.data);
  const editingReportId = parsed.success
    ? (parsed.data.editingReportId ?? null)
    : null;

  const result = await finalizeSubmission(db, {
    userId: internal.id,
    draftId: draft.id,
    data: draft.data,
    editingReportId,
  });

  if (result.ok) {
    // Confirmation email — only for a fresh submission, never an edit.
    // Best-effort: a render/enqueue failure must not fail the submission, so
    // it's awaited but swallowed (the report is already written).
    if (!editingReportId) {
      await enqueueSubmissionConfirmation(
        db,
        internal.id,
        result.reportId,
        user.primaryEmailAddress?.emailAddress ?? null,
      );
    }
    return actionOk({ reportId: result.reportId });
  }
  if (result.reason === "locked") {
    return actionError(
      "locked",
      "This report's 24-hour edit window has closed, so it can no longer be changed.",
    );
  }
  if (result.reason === "not_found") {
    return actionError(
      ACTION_ERROR.invalid,
      "We couldn't find that report to update.",
    );
  }
  if (result.reason === "blocked") {
    // Don't echo the offending text. Contact info / PII is the only blocking
    // category today, so a single message covers it.
    return actionError(
      ACTION_ERROR.invalid,
      "Please remove contact info or personal details (phone numbers, emails, SSNs) before submitting.",
    );
  }
  if (result.reason === "duplicate_company") {
    return actionError(
      ACTION_ERROR.invalid,
      "You already have a report for this company. Edit or delete it before adding another.",
    );
  }
  // reason === "invalid": the payload failed the finalize gate. The form's
  // inline validation should have blocked Submit, so this is a belt-and-braces
  // backstop, not the primary error channel.
  return actionError(
    ACTION_ERROR.invalid,
    "Some details still need fixing before you can submit.",
  );
}
