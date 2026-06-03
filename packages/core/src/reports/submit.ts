// Submission finalization — the orchestrator that turns a validated draft into
// a persisted interview report. This is the single server-side gate the submit
// action calls.
//
// It sits above the data layer and ties three things together:
//   1. validateFinalSubmission (@fromtheloop/shared) — the strict gate. A draft
//      that doesn't pass never touches the database.
//   2. resolve-on-finalize — a "suggested" company or tag is a name with no row
//      yet. We turn each into a real (pending) taxonomy row via the idempotent
//      suggestCompany / suggestTopic helpers BEFORE opening the write
//      transaction. Doing it outside the tx is deliberate: these are
//      idempotent upserts into a moderation queue, harmless to leave behind if
//      the report write later fails, and keeping them out of the tx avoids
//      threading the tx handle through the taxonomy helpers.
//   3. createReport / updateReport (@fromtheloop/db) — the actual row writes.
//
// Edit branch: when the draft carries an editingReportId it's an in-flight edit
// of an existing report. We re-assert ownership + the 24h window here (the
// server action also checks, but this is the authority) and update in place;
// otherwise we create a new report. Either way the source draft is consumed.

import {
  createReport,
  type Database,
  deleteDraft,
  getReport,
  isReportEditable,
  type ReportWriteInput,
  suggestCompany,
  suggestTopic,
  updateReport,
} from "@fromtheloop/db";
import {
  type FinalSubmission,
  type SubmissionIssues,
  type TopicTagSelection,
  validateFinalSubmission,
} from "@fromtheloop/shared";

export interface FinalizeInput {
  // Internal users.id (already resolved from the Clerk principal by the caller).
  userId: string;
  // The draft being finalized; deleted on success. null is tolerated (a direct
  // finalize with no persisted draft), in which case nothing is deleted.
  draftId: string | null;
  // The raw draft jsonb. Re-validated here — never trusted pre-validated.
  data: unknown;
  // When set, edit that report in place instead of creating a new one.
  editingReportId?: string | null;
}

export type FinalizeResult =
  | { ok: true; reportId: string }
  // Draft failed the finalize gate; issues mirror the form for inline display.
  | { ok: false; reason: "invalid"; issues: SubmissionIssues }
  // Edit target doesn't exist or isn't owned by this user.
  | { ok: false; reason: "not_found" }
  // Edit target exists but its 24h window has closed (or it's deleted).
  | { ok: false; reason: "locked" };

// Resolve one question's tag selections to concrete topic ids. "existing" tags
// already have an id; "suggested" tags are upserted to a pending row (idempotent
// on slug) and attributed to the user. All resolved ids are attached — a pending
// tag is a real row, so the FK holds; the ≥1-*active*-tag rule was already
// enforced by validateFinalSubmission.
async function resolveTopicIds(
  db: Database,
  userId: string,
  tags: TopicTagSelection[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const tag of tags) {
    if (tag.kind === "existing") {
      ids.push(tag.id);
    } else {
      const { topic } = await suggestTopic(db, {
        name: tag.name,
        suggestedByUserId: userId,
      });
      ids.push(topic.id);
    }
  }
  return ids;
}

// Turn a validated FinalSubmission into the resolved, id-only ReportWriteInput
// the db layer wants. Resolves the suggested company + every suggested tag.
async function resolveWriteInput(
  db: Database,
  userId: string,
  final: FinalSubmission,
): Promise<ReportWriteInput> {
  let companyId: string;
  if (final.company.kind === "existing") {
    companyId = final.company.id;
  } else {
    const { company } = await suggestCompany(db, {
      name: final.company.name,
      suggestedByUserId: userId,
    });
    companyId = company.id;
  }

  const rounds: ReportWriteInput["rounds"] = [];
  for (const round of final.rounds) {
    const questions: ReportWriteInput["rounds"][number]["questions"] = [];
    for (const question of round.questions) {
      questions.push({
        prose: question.prose,
        topicIds: await resolveTopicIds(db, userId, question.tags),
      });
    }
    rounds.push({
      roundType: round.roundType,
      rating: round.rating,
      experienceProse: round.experience,
      questions,
    });
  }

  return {
    createdByUserId: userId,
    companyId,
    canonicalRoleId: final.role.id,
    level: final.level.name,
    levelId: final.level.id,
    interviewMonth: final.month,
    outcome: final.outcome,
    displayAttribution: final.attribution,
    rounds,
  };
}

export async function finalizeSubmission(
  db: Database,
  input: FinalizeInput,
): Promise<FinalizeResult> {
  const validation = validateFinalSubmission(input.data);
  if (!validation.ok) {
    return { ok: false, reason: "invalid", issues: validation.issues };
  }

  // For an edit, gate on ownership + the window BEFORE doing any resolution
  // writes, so a locked/foreign target can't spawn pending taxonomy rows.
  if (input.editingReportId) {
    const existing = await getReport(db, input.editingReportId, input.userId);
    if (!existing) return { ok: false, reason: "not_found" };
    if (!isReportEditable(existing)) return { ok: false, reason: "locked" };
  }

  const writeInput = await resolveWriteInput(db, input.userId, validation.data);

  let reportId: string;
  if (input.editingReportId) {
    const updated = await updateReport(
      db,
      input.editingReportId,
      input.userId,
      writeInput,
    );
    // Null = the row vanished or changed owner between the gate and the write
    // (a race). Treat as not-found rather than silently creating a new report.
    if (!updated) return { ok: false, reason: "not_found" };
    reportId = updated.id;
  } else {
    reportId = (await createReport(db, writeInput)).id;
  }

  // The draft has served its purpose. Best-effort, ownership-scoped — a miss is
  // harmless (the per-user cap + TTL cron reap it).
  if (input.draftId) {
    await deleteDraft(db, input.draftId, input.userId);
  }

  return { ok: true, reportId };
}
