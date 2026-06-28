// Submission finalization: validate → resolve suggested taxonomy → write. The
// single server-side gate the submit action calls. The editingReportId branch
// re-asserts ownership + the 24h window and updates in place.

import {
  countVerifiedReportsForUser,
  createReport,
  type Database,
  deleteDraft,
  getReport,
  getUserById,
  isReportEditable,
  type ReportWriteInput,
  suggestCompany,
  suggestTopic,
  updateReport,
  userHasReportForCompany,
} from "@fromtheloop/db";
import {
  type FinalSubmission,
  type SubmissionIssues,
  type TopicTagSelection,
  validateFinalSubmission,
} from "@fromtheloop/shared";
import { type ContentCategory, firstBlockingMatch } from "../anti-abuse/regex.js";
import { decideInitialReportStatus } from "./moderation.js";

export interface FinalizeInput {
  userId: string; // internal users.id
  draftId: string | null; // deleted on success; null tolerated
  data: unknown; // raw draft jsonb, re-validated here
  editingReportId?: string | null; // set → edit in place
}

export type FinalizeResult =
  | { ok: true; reportId: string }
  | { ok: false; reason: "invalid"; issues: SubmissionIssues }
  | { ok: false; reason: "not_found" } // edit target missing or not owned
  | { ok: false; reason: "locked" } // 24h window closed (or deleted)
  | { ok: false; reason: "blocked"; category: ContentCategory } // contact info / PII
  | { ok: false; reason: "duplicate_company" }; // 1/company/user cap

function submissionTexts(final: FinalSubmission): string[] {
  const texts: string[] = [];
  for (const round of final.rounds) {
    if (round.experience) texts.push(round.experience);
    for (const question of round.questions) texts.push(question.prose);
  }
  return texts;
}

// "suggested" tags are upserted to a pending row (idempotent) and attributed.
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

// Resolve a FinalSubmission into the id-only ReportWriteInput the db layer wants.
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

  // Contact info / PII hard-rejects before any write.
  const blocked = firstBlockingMatch(submissionTexts(validation.data));
  if (blocked) {
    return { ok: false, reason: "blocked", category: blocked.category };
  }

  // Gate edits before resolution writes, so a locked/foreign target can't spawn
  // pending taxonomy rows.
  if (input.editingReportId) {
    const existing = await getReport(db, input.editingReportId, input.userId);
    if (!existing) return { ok: false, reason: "not_found" };
    if (!isReportEditable(existing)) return { ok: false, reason: "locked" };
  }

  const writeInput = await resolveWriteInput(db, input.userId, validation.data);

  // Per-company cap (create path only), after company resolution.
  if (!input.editingReportId) {
    const dupe = await userHasReportForCompany(
      db,
      input.userId,
      writeInput.companyId,
    );
    if (dupe) return { ok: false, reason: "duplicate_company" };
  }

  let reportId: string;
  if (input.editingReportId) {
    const updated = await updateReport(
      db,
      input.editingReportId,
      input.userId,
      writeInput,
    );
    if (!updated) return { ok: false, reason: "not_found" }; // raced away
    reportId = updated.id;
  } else {
    // New-user moderation hold (editing never re-runs this).
    const user = await getUserById(db, input.userId);
    const verifiedReportCount = await countVerifiedReportsForUser(
      db,
      input.userId,
    );
    const status = decideInitialReportStatus({
      accountAgeMs: user ? Date.now() - user.createdAt.getTime() : 0,
      verifiedReportCount,
    });
    reportId = (await createReport(db, { ...writeInput, status })).id;
  }

  // Best-effort, ownership-scoped; a miss is harmless.
  if (input.draftId) {
    await deleteDraft(db, input.draftId, input.userId);
  }

  return { ok: true, reportId };
}
