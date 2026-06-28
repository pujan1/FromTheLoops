// Pure-persistence report writes (input is fully resolved — no "suggested"
// arms) + the reads the edit/detail flows need. A report is interview_reports +
// ordered rounds[] → questions[] → question_topics[]. Edits rewrite the child
// tree in place, leaving created_at/locked_at untouched.

import { and, asc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { emitReportEvent } from "../pipeline/events.js";
import {
  companies,
  type InterviewReport,
  interviewReports,
  type NewInterviewReport,
  type NewRound,
  questions,
  questionTopics,
  roles,
  rounds,
  topics,
} from "../schema/index.js";
import type { Db, Tx } from "../lib/types.js";
import { DAY_MS } from "../lib/time.js";

// The DB owns the boundary (locked_at); this is for JS-side reasoning.
export const EDIT_WINDOW_MS = DAY_MS;

export interface QuestionWriteInput {
  prose: string;
  topicIds: string[];
}

export interface RoundWriteInput {
  roundType: NewRound["roundType"];
  rating: NewRound["rating"];
  experienceProse: string | null;
  questions: QuestionWriteInput[];
}

export interface ReportWriteInput {
  createdByUserId: string;
  companyId: string;
  canonicalRoleId: string;
  level: string;
  levelId: string | null; // null = "N/A" sentinel
  interviewMonth: string; // "YYYY-MM"
  outcome: NewInterviewReport["outcome"];
  displayAttribution: NonNullable<NewInterviewReport["displayAttribution"]>;
  status?: NewInterviewReport["status"]; // omit → default 'pending_moderation'
  rounds: RoundWriteInput[];
}

// orderIndex = array position. Shared by createReport + updateReport.
async function writeChildren(
  tx: Tx,
  reportId: string,
  roundInputs: RoundWriteInput[],
): Promise<void> {
  for (const [roundIndex, round] of roundInputs.entries()) {
    const insertedRound = await tx
      .insert(rounds)
      .values({
        reportId,
        orderIndex: roundIndex,
        roundType: round.roundType,
        rating: round.rating,
        experienceProse: round.experienceProse,
      })
      .returning({ id: rounds.id });
    const roundId = insertedRound[0]!.id;

    for (const [questionIndex, question] of round.questions.entries()) {
      const insertedQuestion = await tx
        .insert(questions)
        .values({
          roundId,
          orderIndex: questionIndex,
          questionProse: question.prose,
        })
        .returning({ id: questions.id });
      const questionId = insertedQuestion[0]!.id;

      // Dedupe so a double-added tag can't violate the PK.
      const uniqueTopicIds = [...new Set(question.topicIds)];
      if (uniqueTopicIds.length > 0) {
        await tx
          .insert(questionTopics)
          .values(uniqueTopicIds.map((topicId) => ({ questionId, topicId })));
      }
    }
  }
}

export async function createReport(
  db: Db,
  input: ReportWriteInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(interviewReports)
      .values({
        createdByUserId: input.createdByUserId,
        companyId: input.companyId,
        canonicalRoleId: input.canonicalRoleId,
        level: input.level,
        levelId: input.levelId,
        interviewMonth: input.interviewMonth,
        outcome: input.outcome,
        displayAttribution: input.displayAttribution,
        ...(input.status ? { status: input.status } : {}),
      })
      .returning({ id: interviewReports.id });
    const reportId = inserted[0]!.id;

    await writeChildren(tx, reportId, input.rounds);
    await emitReportEvent(tx, {
      op: "created",
      reportId,
      companyId: input.companyId,
      canonicalRoleId: input.canonicalRoleId,
      level: input.level,
    });
    return { id: reportId };
  });
}

// Overwrites columns + fully replaces children, leaving created_at/locked_at
// untouched. null if (id, userId) doesn't match an owned row.
export async function updateReport(
  db: Db,
  reportId: string,
  userId: string,
  input: ReportWriteInput,
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    // Capture the pre-edit cell: a moved report re-aggregates both old + new.
    const before = await tx
      .select({
        companyId: interviewReports.companyId,
        canonicalRoleId: interviewReports.canonicalRoleId,
        level: interviewReports.level,
      })
      .from(interviewReports)
      .where(
        and(
          eq(interviewReports.id, reportId),
          eq(interviewReports.createdByUserId, userId),
        ),
      )
      .limit(1);
    if (!before[0]) return null;

    const updated = await tx
      .update(interviewReports)
      .set({
        companyId: input.companyId,
        canonicalRoleId: input.canonicalRoleId,
        level: input.level,
        levelId: input.levelId,
        interviewMonth: input.interviewMonth,
        outcome: input.outcome,
        displayAttribution: input.displayAttribution,
      })
      .where(
        and(
          eq(interviewReports.id, reportId),
          eq(interviewReports.createdByUserId, userId),
        ),
      )
      .returning({ id: interviewReports.id });
    if (!updated[0]) return null;

    // Children CASCADE from rounds, so deleting rounds clears the whole tree.
    await tx.delete(rounds).where(eq(rounds.reportId, reportId));
    await writeChildren(tx, reportId, input.rounds);

    await emitReportEvent(tx, {
      op: "updated",
      reportId,
      companyId: input.companyId,
      canonicalRoleId: input.canonicalRoleId,
      level: input.level,
    });
    // If the edit moved cells, also refresh the vacated old cell.
    const moved =
      before[0].companyId !== input.companyId ||
      before[0].canonicalRoleId !== input.canonicalRoleId ||
      before[0].level !== input.level;
    if (moved) {
      await emitReportEvent(tx, {
        op: "updated",
        reportId,
        companyId: before[0].companyId,
        canonicalRoleId: before[0].canonicalRoleId,
        level: before[0].level,
      });
    }
    return { id: reportId };
  });
}

// Ownership-scoped, idempotent soft-delete (status → 'deleted', stamp
// deleted_at). False if (id, userId) matched nothing live.
export async function softDeleteReport(
  db: Db,
  id: string,
  userId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(
        and(
          eq(interviewReports.id, id),
          eq(interviewReports.createdByUserId, userId),
          // Skip already-deleted so a re-stamp can't slide the purge clock.
          ne(interviewReports.status, "deleted"),
        ),
      )
      .returning({
        id: interviewReports.id,
        companyId: interviewReports.companyId,
        canonicalRoleId: interviewReports.canonicalRoleId,
        level: interviewReports.level,
      });
    const row = rows[0];
    if (!row) return false;
    await emitReportEvent(tx, {
      op: "deleted",
      reportId: row.id,
      companyId: row.companyId,
      canonicalRoleId: row.canonicalRoleId,
      level: row.level,
    });
    return true;
  });
}

// Retention window before a soft-deleted report's prose is scrubbed.
export const PII_RETENTION_MS = 90 * DAY_MS;

// Clears free-text PII (experience_prose → null, question_prose → '') for
// reports deleted before `before`. Stamps pii_purged_at. Idempotent (daily cron).
export async function purgeDeletedReportPii(
  db: Db,
  before: Date,
): Promise<{ reportsPurged: number }> {
  return db.transaction(async (tx) => {
    const targets = await tx
      .select({ id: interviewReports.id })
      .from(interviewReports)
      .where(
        and(
          eq(interviewReports.status, "deleted"),
          lt(interviewReports.deletedAt, before),
          isNull(interviewReports.piiPurgedAt),
        ),
      );
    if (targets.length === 0) return { reportsPurged: 0 };
    const reportIds = targets.map((t) => t.id);

    await tx
      .update(rounds)
      .set({ experienceProse: null })
      .where(inArray(rounds.reportId, reportIds));

    // Questions key on round_id, so resolve round ids first.
    const roundIdRows = await tx
      .select({ id: rounds.id })
      .from(rounds)
      .where(inArray(rounds.reportId, reportIds));
    const roundIds = roundIdRows.map((r) => r.id);
    if (roundIds.length > 0) {
      await tx
        .update(questions)
        .set({ questionProse: "" })
        .where(inArray(questions.roundId, roundIds));
    }

    await tx
      .update(interviewReports)
      .set({ piiPurgedAt: new Date() })
      .where(inArray(interviewReports.id, reportIds));

    return { reportsPurged: reportIds.length };
  });
}

// "1 submission per company per user" — soft-deleted reports don't count.
export async function userHasReportForCompany(
  db: Db,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: interviewReports.id })
    .from(interviewReports)
    .where(
      and(
        eq(interviewReports.createdByUserId, userId),
        eq(interviewReports.companyId, companyId),
        ne(interviewReports.status, "deleted"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Non-deleted evidence_verified reports. Feeds the new-user moderation-hold
// decision. 0 for everyone in V1 (nothing sets evidence_verified yet).
export async function countVerifiedReportsForUser(
  db: Db,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ id: interviewReports.id })
    .from(interviewReports)
    .where(
      and(
        eq(interviewReports.createdByUserId, userId),
        eq(interviewReports.evidenceVerified, true),
        ne(interviewReports.status, "deleted"),
      ),
    );
  return rows.length;
}

// Report id → author's user id (for the karma consumer). Reads any status.
export async function getReportAuthorId(
  db: Db,
  reportId: string,
): Promise<string | null> {
  const rows = await db
    .select({ userId: interviewReports.createdByUserId })
    .from(interviewReports)
    .where(eq(interviewReports.id, reportId))
    .limit(1);
  return rows[0]?.userId ?? null;
}

// Ownership-scoped: null if missing or owned by another user (no existence oracle).
export async function getReport(
  db: Db,
  id: string,
  userId: string,
): Promise<InterviewReport | null> {
  const rows = await db
    .select()
    .from(interviewReports)
    .where(
      and(
        eq(interviewReports.id, id),
        eq(interviewReports.createdByUserId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// now < locked_at and not soft-deleted.
export function isReportEditable(
  report: Pick<InterviewReport, "lockedAt" | "status">,
  now: Date = new Date(),
): boolean {
  return report.status !== "deleted" && now.getTime() < report.lockedAt.getTime();
}

// The owner's own dashboard view: carries status + lockedAt + attribution.
export interface OwnReportListItem {
  id: string;
  companySlug: string;
  companyName: string;
  roleName: string;
  level: string;
  outcome: InterviewReport["outcome"];
  interviewMonth: string;
  status: InterviewReport["status"];
  displayAttribution: NonNullable<InterviewReport["displayAttribution"]>;
  createdAt: Date;
  lockedAt: Date;
}

// A user's reports, newest first. Excludes soft-deleted; keeps pending_moderation.
export async function listOwnReports(
  db: Db,
  userId: string,
): Promise<OwnReportListItem[]> {
  const rows = await db.execute<{
    id: string;
    company_slug: string;
    company_name: string;
    role_name: string;
    level: string;
    outcome: InterviewReport["outcome"];
    interview_month: string;
    status: InterviewReport["status"];
    display_attribution: NonNullable<InterviewReport["displayAttribution"]>;
    created_at: string | Date;
    locked_at: string | Date;
  }>(sql`
    SELECT r.id, r.level, r.outcome, r.interview_month, r.status,
           r.display_attribution, r.created_at, r.locked_at,
           c.slug AS company_slug, c.name AS company_name,
           ro.name AS role_name
    FROM interview_reports r
    JOIN companies c ON c.id = r.company_id
    JOIN roles ro ON ro.id = r.canonical_role_id
    WHERE r.created_by_user_id = ${userId}::uuid
      AND r.status <> 'deleted'
    ORDER BY r.created_at DESC
  `);
  return rows.map((r) => ({
    id: r.id,
    companySlug: r.company_slug,
    companyName: r.company_name,
    roleName: r.role_name,
    level: r.level,
    outcome: r.outcome,
    interviewMonth: r.interview_month,
    status: r.status,
    displayAttribution: r.display_attribution,
    createdAt: new Date(r.created_at),
    lockedAt: new Date(r.locked_at),
  }));
}

export interface ReportTopicDetail {
  id: string;
  slug: string;
  name: string;
}

export interface ReportQuestionDetail {
  id: string; // exposed so a reader can quote this question in a comment
  prose: string;
  topics: ReportTopicDetail[];
}

export interface ReportRoundDetail {
  roundType: NewRound["roundType"];
  rating: NewRound["rating"];
  experienceProse: string | null;
  questions: ReportQuestionDetail[];
}

export interface ReportDetail {
  report: InterviewReport;
  company: { id: string; slug: string; name: string };
  role: { id: string; slug: string; name: string };
  level: { id: string | null; name: string };
  interviewMonth: string;
  outcome: InterviewReport["outcome"];
  displayAttribution: InterviewReport["displayAttribution"];
  rounds: ReportRoundDetail[];
}

// JSON-safe, content-only slice for the wire: no Dates, no viewer-specific chrome.
export interface ReportDetailView {
  id: string;
  companyName: string;
  roleName: string;
  levelName: string;
  interviewMonth: string;
  outcome: InterviewReport["outcome"];
  evidenceVerified: boolean;
  rounds: ReportRoundDetail[];
}

// The attributed author name is resolved separately by the caller.
export function toReportDetailView(detail: ReportDetail): ReportDetailView {
  return {
    id: detail.report.id,
    companyName: detail.company.name,
    roleName: detail.role.name,
    levelName: detail.level.name,
    interviewMonth: detail.interviewMonth,
    outcome: detail.report.outcome,
    evidenceVerified: detail.report.evidenceVerified,
    rounds: detail.rounds,
  };
}

// Ownership-scoped deep read for the edit screen. null if not found or not owned.
export async function getReportForEdit(
  db: Db,
  id: string,
  userId: string,
): Promise<ReportDetail | null> {
  const headRows = await db
    .select(reportHeadColumns)
    .from(interviewReports)
    .innerJoin(companies, eq(companies.id, interviewReports.companyId))
    .innerJoin(roles, eq(roles.id, interviewReports.canonicalRoleId))
    .where(
      and(
        eq(interviewReports.id, id),
        eq(interviewReports.createdByUserId, userId),
      ),
    )
    .limit(1);
  const head = headRows[0];
  if (!head) return null;
  return assembleReportDetail(db, head);
}

// The head row both deep reads fetch (differing only in their WHERE).
interface ReportHead {
  report: InterviewReport;
  companyId: string;
  companySlug: string;
  companyName: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
}

const reportHeadColumns = {
  report: interviewReports,
  companyId: companies.id,
  companySlug: companies.slug,
  companyName: companies.name,
  roleId: roles.id,
  roleSlug: roles.slug,
  roleName: roles.name,
} as const;

// Loads the rounds→questions→topics tree and folds it into ReportDetail.
async function assembleReportDetail(
  db: Db,
  head: ReportHead,
): Promise<ReportDetail> {
  const id = head.report.id;

  const roundRows = await db
    .select()
    .from(rounds)
    .where(eq(rounds.reportId, id))
    .orderBy(asc(rounds.orderIndex));

  // All questions in one query (joined to topics) to avoid N round-scoped reads.
  const questionRows = await db
    .select({
      questionId: questions.id,
      roundId: questions.roundId,
      questionOrder: questions.orderIndex,
      prose: questions.questionProse,
      topicId: topics.id,
      topicSlug: topics.slug,
      topicName: topics.name,
    })
    .from(questions)
    .innerJoin(rounds, eq(rounds.id, questions.roundId))
    .leftJoin(questionTopics, eq(questionTopics.questionId, questions.id))
    .leftJoin(topics, eq(topics.id, questionTopics.topicId))
    .where(eq(rounds.reportId, id))
    .orderBy(asc(questions.roundId), asc(questions.orderIndex));

  // Fold the flat (question × topic) rows into question → topics[].
  const questionsByRound = new Map<string, ReportQuestionDetail[]>();
  const seen = new Map<string, ReportQuestionDetail>();
  for (const row of questionRows) {
    const key = `${row.roundId}:${row.questionOrder}`;
    let q = seen.get(key);
    if (!q) {
      q = { id: row.questionId, prose: row.prose, topics: [] };
      seen.set(key, q);
      const list = questionsByRound.get(row.roundId) ?? [];
      list.push(q);
      questionsByRound.set(row.roundId, list);
    }
    if (row.topicId && row.topicSlug && row.topicName) {
      q.topics.push({ id: row.topicId, slug: row.topicSlug, name: row.topicName });
    }
  }

  return {
    report: head.report,
    company: { id: head.companyId, slug: head.companySlug, name: head.companyName },
    role: { id: head.roleId, slug: head.roleSlug, name: head.roleName },
    level: { id: head.report.levelId, name: head.report.level },
    interviewMonth: head.report.interviewMonth,
    outcome: head.report.outcome,
    displayAttribution: head.report.displayAttribution,
    rounds: roundRows.map((r) => ({
      roundType: r.roundType,
      rating: r.rating,
      experienceProse: r.experienceProse,
      questions: questionsByRound.get(r.id) ?? [],
    })),
  };
}

// Public deep read for /reports/[id]. Gated on status='active' AND deleted_at
// IS NULL; anything else returns null (→ 404).
export async function getPublicReportDetail(
  db: Db,
  id: string,
): Promise<ReportDetail | null> {
  const headRows = await db
    .select(reportHeadColumns)
    .from(interviewReports)
    .innerJoin(companies, eq(companies.id, interviewReports.companyId))
    .innerJoin(roles, eq(roles.id, interviewReports.canonicalRoleId))
    .where(
      and(
        eq(interviewReports.id, id),
        eq(interviewReports.status, "active"),
        isNull(interviewReports.deletedAt),
      ),
    )
    .limit(1);
  const head = headRows[0];
  if (!head) return null;
  return assembleReportDetail(db, head);
}
