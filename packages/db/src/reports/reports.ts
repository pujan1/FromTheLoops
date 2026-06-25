// Interview-report data-access: the transactional writes that turn a
// validated submission into rows, plus the reads the edit flow needs.
//
// Layering: this file is *pure persistence*. It takes a fully-resolved
// ReportWriteInput — every company / role / level / topic id already exists
// (no "suggested" arms left). Validation lives in @fromtheloop/shared and the
// suggested-taxonomy resolution lives in @fromtheloop/core; this package has no
// dependency on either, so the write here is deliberately dumb.
//
// One report is interview_reports + ordered rounds[] + ordered questions[] +
// question_topics[] join rows. createReport writes them in a single
// transaction; updateReport rewrites the children in place (edit-within-24h)
// by deleting the report's rounds — questions and question_topics CASCADE from
// rounds — and re-inserting, leaving created_at / locked_at untouched so an
// edit never extends the window.

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

// The 24h edit window, in ms. The DB owns the boundary itself
// (interview_reports.locked_at is a generated column = created_at + 24h); this
// constant exists for any caller that wants to reason about the window in JS
// (e.g. "time left" copy) and to document the figure in one place.
export const EDIT_WINDOW_MS = DAY_MS;

// A question's resolved shape: prose + the topic ids to attach. Ids are
// already real rows (active or freshly-suggested pending) — the FK is
// satisfied either way. Caller is responsible for the ≥1-active-tag rule.
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
  // Text level name (drives the wedge index) + the optional FK to the
  // per-company level row. Both populated; levelId null = "N/A" sentinel.
  level: string;
  levelId: string | null;
  // Interview month "YYYY-MM".
  interviewMonth: string;
  outcome: NewInterviewReport["outcome"];
  displayAttribution: NonNullable<NewInterviewReport["displayAttribution"]>;
  // Initial moderation status. Omit to take the column default
  // ('pending_moderation'); the new-user-hold decision sets it explicitly.
  status?: NewInterviewReport["status"];
  rounds: RoundWriteInput[];
}

// Insert the round/question/topic children of an already-inserted report.
// Order is positional: orderIndex = array position, which is what the rounds
// form serializes. Shared by createReport and updateReport.
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

      // Dedupe topic ids so a double-added tag can't violate the
      // (question_id, topic_id) primary key.
      const uniqueTopicIds = [...new Set(question.topicIds)];
      if (uniqueTopicIds.length > 0) {
        await tx
          .insert(questionTopics)
          .values(uniqueTopicIds.map((topicId) => ({ questionId, topicId })));
      }
    }
  }
}

// Write a brand-new report + its children in one transaction. created_at
// defaults to now() and locked_at is the generated created_at + 24h, so the
// window boundary is set by the DB, not passed in.
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
        // Omitted → column default 'pending_moderation'.
        ...(input.status ? { status: input.status } : {}),
      })
      .returning({ id: interviewReports.id });
    const reportId = inserted[0]!.id;

    await writeChildren(tx, reportId, input.rounds);
    // Outbox event in the same tx: aggregate/search refresh for this cell.
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

// Edit-in-place: overwrite the report's top-level columns and fully replace
// its children. created_at / locked_at are NOT touched — editing inside the
// window must not slide the window forward. Returns null if (id, userId)
// doesn't match an editable row the caller owns (the caller should have
// already gated on isReportEditable; this is the persistence-level guard).
export async function updateReport(
  db: Db,
  reportId: string,
  userId: string,
  input: ReportWriteInput,
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    // Capture the pre-edit cell first: an edit may move the report to a
    // different (company, role, level), which means BOTH the old and new cells
    // need re-aggregating (old loses this report, new gains it).
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

    // Delete the report's rounds; questions + question_topics CASCADE from
    // rounds, so this clears the whole child tree. Then re-insert.
    await tx.delete(rounds).where(eq(rounds.reportId, reportId));
    await writeChildren(tx, reportId, input.rounds);

    // New-cell event (current state). The search consumer upserts the doc from
    // this; the aggregate consumer recomputes the new cell.
    await emitReportEvent(tx, {
      op: "updated",
      reportId,
      companyId: input.companyId,
      canonicalRoleId: input.canonicalRoleId,
      level: input.level,
    });
    // If the edit moved cells, also refresh the vacated old cell. Still op
    // 'updated' (the report isn't gone) — the aggregate handler just recomputes
    // that cell; a redundant search upsert of the same current doc is harmless.
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

// Soft delete: flip status to 'deleted' and stamp deleted_at = now(). The row
// stays in the table (created_by_user_id is ON DELETE RESTRICT — the report is
// the audit trail), but isReportEditable and every read surface treat 'deleted'
// as gone. Ownership-scoped and idempotent: only matches a row this user owns
// that isn't already deleted, so a double-submit is a harmless no-op. Returns
// true if a row was deleted, false if (id, userId) matched nothing live.
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
          // Skip rows already deleted so a double-submit can't re-stamp
          // deleted_at and slide the 90-day purge clock forward.
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
    // The report drops out of its cell's aggregate (the refresh filters on
    // status='active'); emit so that cell recomputes. Search drops the doc.
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

// PII retention for soft-deleted reports: free-text prose is cleared once a
// report has been in the 'deleted' state this long. 90 days gives a window for
// dispute/appeal/audit before the user's words are irrecoverably scrubbed.
export const PII_RETENTION_MS = 90 * DAY_MS;

// 90-day PII purge. Finds soft-deleted reports whose deleted_at is older than
// `before` (caller passes now - PII_RETENTION_MS) and that haven't been purged
// yet, then clears their free-text PII: round experience_prose → null and
// question_prose → '' (the column is NOT NULL, so '' is the redaction). The
// report, rounds, questions and topic joins all remain — only the free text a
// user typed (which can carry names, contact info, etc.) is scrubbed. Stamps
// pii_purged_at so a re-run skips already-cleared rows. Idempotent and run by
// the worker's daily cron. Returns how many reports were purged this pass.
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

    // Clear round-level free text directly (rounds carry report_id).
    await tx
      .update(rounds)
      .set({ experienceProse: null })
      .where(inArray(rounds.reportId, reportIds));

    // Questions reference round_id, not report_id, so resolve the round ids
    // for these reports first, then redact their prose in one statement.
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

// "1 submission per company per user" — does this user already have a
// non-deleted report for this company? Soft-deleted reports don't count, so
// deleting a report frees the slot to resubmit. This is the durable form of
// the per-company cap (a count, not a time window), enforced at finalize for
// the create path only (an edit keeps the same company). Admin override is a
// later concern — V1 has no bypass.
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

// Count this user's "verified submissions" — non-deleted reports flagged
// evidence_verified=true (the user had a verified work association with the
// company; see user_verifications). Feeds the new-user moderation-hold
// decision ("drops after 3 verified submissions"). In V1 nothing sets
// evidence_verified yet, so this is 0 for everyone — the hold logic is encoded
// now, ready for Sprint 6 verification tooling.
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

// Resolve a report id to its author's internal user id. The karma consumer
// (recompute-karma worker) needs this: the events outbox carries the report's
// cell (company/role/level) but not the author, and karma is per-USER. Returns
// null for an unknown id. Reads regardless of status — a 'deleted' event still
// names a live (soft-deleted) row whose author's karma must be recomputed.
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

// Ownership-scoped fetch (mirrors getDraft): returns the report row or null
// if it doesn't exist OR belongs to another user — no existence oracle.
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

// now < locked_at and not soft-deleted. Default `now` keeps callers terse;
// tests pass a fixed clock.
export function isReportEditable(
  report: Pick<InterviewReport, "lockedAt" | "status">,
  now: Date = new Date(),
): boolean {
  return report.status !== "deleted" && now.getTime() < report.lockedAt.getTime();
}

// One row of the private dashboard's "your reports" list. Unlike the public
// browse reads (which only ever surface VISIBLE, often anonymized rows), this
// is the owner's own view: it carries the moderation `status` and the
// `lockedAt` boundary so the dashboard can label each report's edit-window
// state (editable vs locked) and whether it's still awaiting moderation.
// Attribution rides along so the owner sees how each report appears publicly.
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

// A user's submitted reports, newest first, for the private dashboard. Excludes
// soft-deleted rows (the owner deleted them on purpose; they shouldn't clutter
// the list) but KEEPS pending_moderation ones — the author should see a report
// they just submitted even before a mod clears it. Not ownership-leaky: it's
// only ever called with the signed-in user's own internal id.
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

// The fully-joined report the edit flow rehydrates into a form. Plain shape
// (no @fromtheloop/shared dependency) — core maps this to a SubmissionDraft.
export interface ReportTopicDetail {
  id: string;
  slug: string;
  name: string;
}

export interface ReportQuestionDetail {
  // The question's id — lets a reader quote this exact question in a comment
  // (ADR-0011). Safe to expose: it only ever resolves a question within a
  // report the viewer can already read.
  id: string;
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
  // From the report's own columns (level text + nullable levelId) — no join.
  level: { id: string | null; name: string };
  // "YYYY-MM" — straight off the report row.
  interviewMonth: string;
  outcome: InterviewReport["outcome"];
  displayAttribution: InterviewReport["displayAttribution"];
  rounds: ReportRoundDetail[];
}

// The JSON-safe, presentational slice of a ReportDetail — what crosses the wire
// to the client triage pane and feeds the shared <ReportDetailBody>. Deliberately
// content-only: no `Date` fields (ReportDetail.report carries lockedAt/createdAt/
// deletedAt, none of which serialize cleanly or belong on a public preview), and
// no viewer-specific chrome (attribution byline, eyebrow, owner controls, helpful
// state) — those stay the caller's, resolved per-viewer. The rounds tree is
// already plain (ReportRoundDetail/Question/Topic hold no Dates), so it rides
// through unchanged.
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

// Map a deep ReportDetail down to its wire-safe presentational view. The
// attributed author name is resolved separately by the caller (it needs a users
// lookup the deep read doesn't do) and travels alongside, never inside the view.
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

// Ownership-scoped deep read for the edit screen. Returns the report plus its
// company / role names and the full rounds→questions→topics tree, ordered the
// way it was submitted. null if not found or not owned.
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

// The head row both deep reads fetch (they differ only in their WHERE clause).
interface ReportHead {
  report: InterviewReport;
  companyId: string;
  companySlug: string;
  companyName: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
}

// The select shape shared by getReportForEdit + getPublicReportDetail.
const reportHeadColumns = {
  report: interviewReports,
  companyId: companies.id,
  companySlug: companies.slug,
  companyName: companies.name,
  roleId: roles.id,
  roleSlug: roles.slug,
  roleName: roles.name,
} as const;

// Load a head row's rounds→questions→topics tree and fold it into ReportDetail.
// Shared by both deep reads so the (somewhat fiddly) join-folding lives once.
async function assembleReportDetail(
  db: Db,
  head: ReportHead,
): Promise<ReportDetail> {
  const id = head.report.id;

  // Rounds in declared order.
  const roundRows = await db
    .select()
    .from(rounds)
    .where(eq(rounds.reportId, id))
    .orderBy(asc(rounds.orderIndex));

  // All questions for this report's rounds, in declared order, joined to
  // their topics. One query keeps the round count from fanning out into N
  // round-scoped queries.
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

  // Fold the flat (question × topic) rows into question → topics[]. The query
  // is ordered by (roundId, questionOrder) so questions group naturally; the
  // map keys on (roundId|order) to collect topics across the join's duplicate
  // question rows.
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

// Public deep read for the Sprint-4 report detail page (`/reports/[id]`). NOT
// ownership-scoped — anyone can read it — but gated on the SAME visibility
// filter as every other public surface: `status = 'active' AND deleted_at IS
// NULL`. A pending/deleted/guessed id returns null → the page 404s, so a
// non-public report never leaks through this read.
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
