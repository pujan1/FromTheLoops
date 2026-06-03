// Report transactional writes + edit-flow reads, against a real Postgres
// (shared testcontainer via makeTestClient). Focus: the row tree createReport
// emits, the generated locked_at boundary, edit-in-place semantics
// (children rewritten, created_at/locked_at preserved), the deep edit read,
// and the isReportEditable clock.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  countVerifiedReportsForUser,
  createReport,
  EDIT_WINDOW_MS,
  getReport,
  getReportForEdit,
  getOrCreateUserByClerkId,
  isReportEditable,
  PII_RETENTION_MS,
  purgeDeletedReportPii,
  type ReportWriteInput,
  softDeleteReport,
  updateReport,
} from "../src/index.js";
import {
  companies,
  companyLevels,
  interviewReports,
  questions,
  questionTopics,
  roles,
  rounds,
  topics,
  users,
} from "../src/schema/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

const OWNER_CLERK = "clerk_report_owner";
const OTHER_CLERK = "clerk_report_other";

describe("interview reports", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let ownerId: string;
  let otherId: string;
  let companyId: string;
  let roleId: string;
  let levelId: string;
  let topicAId: string;
  let topicBId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    ownerId = (await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK })).id;
    otherId = (await getOrCreateUserByClerkId(db, { clerkId: OTHER_CLERK })).id;

    companyId = (
      await db
        .insert(companies)
        .values({ slug: "acme", name: "Acme", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    levelId = (
      await db
        .insert(companyLevels)
        .values({ companyId, slug: "l4", name: "L4", orderIndex: 0 })
        .returning({ id: companyLevels.id })
    )[0]!.id;
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "swe", name: "Software Engineer", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicAId = (
      await db
        .insert(topics)
        .values({ slug: "arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
    topicBId = (
      await db
        .insert(topics)
        .values({ slug: "graphs", name: "Graphs", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    // Order matters: reports RESTRICT both the user and taxonomy deletes, so
    // clear reports first (rounds/questions/joins CASCADE from them), then the
    // taxonomy rows this file created, then the users.
    await db.delete(interviewReports).where(eq(interviewReports.createdByUserId, ownerId));
    await db.delete(companyLevels).where(eq(companyLevels.id, levelId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(topics).where(inArray(topics.id, [topicAId, topicBId]));
    await db.delete(users).where(inArray(users.clerkId, [OWNER_CLERK, OTHER_CLERK]));
    await close();
  });

  // Each case starts clean: deleting report heads cascades to
  // rounds → questions → question_topics.
  beforeEach(async () => {
    await db.delete(interviewReports);
  });

  function fullInput(overrides: Partial<ReportWriteInput> = {}): ReportWriteInput {
    return {
      createdByUserId: ownerId,
      companyId,
      canonicalRoleId: roleId,
      level: "L4",
      levelId,
      interviewMonth: "2026-05",
      outcome: "offer",
      displayAttribution: "anonymous",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: "Two LC-medium problems.",
          questions: [
            { prose: "Reverse a linked list", topicIds: [topicAId] },
            { prose: "Course schedule", topicIds: [topicAId, topicBId] },
          ],
        },
        {
          roundType: "onsite-behavioral",
          rating: "mixed",
          experienceProse: null,
          questions: [],
        },
      ],
      ...overrides,
    };
  }

  it("writes the full report tree and a locked_at = created_at + 24h", async () => {
    const { id } = await createReport(db, fullInput());

    const report = await getReport(db, id, ownerId);
    expect(report).not.toBeNull();
    expect(report!.companyId).toBe(companyId);
    expect(report!.level).toBe("L4");
    expect(report!.levelId).toBe(levelId);
    expect(report!.interviewMonth).toBe("2026-05");
    expect(report!.outcome).toBe("offer");
    // Generated boundary is exactly created_at + 24h.
    expect(report!.lockedAt.getTime() - report!.createdAt.getTime()).toBe(
      EDIT_WINDOW_MS,
    );

    const roundRows = await db.select().from(rounds).where(eq(rounds.reportId, id));
    expect(roundRows).toHaveLength(2);
    expect(roundRows.map((r) => r.orderIndex).sort()).toEqual([0, 1]);

    const codingRound = roundRows.find((r) => r.roundType === "onsite-coding")!;
    const qRows = await db
      .select()
      .from(questions)
      .where(eq(questions.roundId, codingRound.id));
    expect(qRows).toHaveLength(2);

    const joinRows = await db
      .select()
      .from(questionTopics)
      .where(inArray(questionTopics.questionId, qRows.map((q) => q.id)));
    // 1 topic on the first question + 2 on the second = 3 join rows.
    expect(joinRows).toHaveLength(3);
  });

  it("dedupes duplicate topic ids on a question", async () => {
    const { id } = await createReport(
      db,
      fullInput({
        rounds: [
          {
            roundType: "technical-phone",
            rating: "positive",
            experienceProse: null,
            questions: [{ prose: "Q", topicIds: [topicAId, topicAId, topicBId] }],
          },
        ],
      }),
    );
    const qRows = await db
      .select({ id: questions.id })
      .from(questions)
      .innerJoin(rounds, eq(rounds.id, questions.roundId))
      .where(eq(rounds.reportId, id));
    const joins = await db
      .select()
      .from(questionTopics)
      .where(eq(questionTopics.questionId, qRows[0]!.id));
    expect(joins).toHaveLength(2); // A (deduped) + B
  });

  it("getReport is ownership-scoped", async () => {
    const { id } = await createReport(db, fullInput());
    expect((await getReport(db, id, ownerId))?.id).toBe(id);
    expect(await getReport(db, id, otherId)).toBeNull();
  });

  it("updateReport rewrites children and preserves created_at / locked_at", async () => {
    const { id } = await createReport(db, fullInput());
    const before = await getReport(db, id, ownerId);

    const res = await updateReport(db, id, ownerId, {
      ...fullInput(),
      outcome: "reject",
      rounds: [
        {
          roundType: "recruiter-screen",
          rating: "negative",
          experienceProse: "Short call.",
          questions: [{ prose: "Why us?", topicIds: [topicBId] }],
        },
      ],
    });
    expect(res).not.toBeNull();

    const after = await getReport(db, id, ownerId);
    expect(after!.outcome).toBe("reject");
    // Window not extended.
    expect(after!.createdAt.getTime()).toBe(before!.createdAt.getTime());
    expect(after!.lockedAt.getTime()).toBe(before!.lockedAt.getTime());

    // Old children gone, new ones in place: 1 round, 1 question, 1 join.
    const roundRows = await db.select().from(rounds).where(eq(rounds.reportId, id));
    expect(roundRows).toHaveLength(1);
    expect(roundRows[0]!.roundType).toBe("recruiter-screen");
  });

  it("updateReport refuses a report the user doesn't own", async () => {
    const { id } = await createReport(db, fullInput());
    expect(await updateReport(db, id, otherId, fullInput())).toBeNull();
  });

  it("getReportForEdit returns the joined tree in declared order", async () => {
    const { id } = await createReport(db, fullInput());
    const detail = await getReportForEdit(db, id, ownerId);
    expect(detail).not.toBeNull();
    expect(detail!.company.name).toBe("Acme");
    expect(detail!.role.name).toBe("Software Engineer");
    expect(detail!.level).toEqual({ id: levelId, name: "L4" });
    expect(detail!.interviewMonth).toBe("2026-05");
    expect(detail!.rounds).toHaveLength(2);
    expect(detail!.rounds[0]!.roundType).toBe("onsite-coding");
    expect(detail!.rounds[0]!.questions[1]!.topics.map((t) => t.slug).sort()).toEqual(
      ["arrays", "graphs"],
    );
    // Empty round carries no questions.
    expect(detail!.rounds[1]!.questions).toHaveLength(0);
    // Foreign user can't read it.
    expect(await getReportForEdit(db, id, otherId)).toBeNull();
  });

  it("isReportEditable tracks the locked_at clock and deleted status", async () => {
    const { id } = await createReport(db, fullInput());
    const report = (await getReport(db, id, ownerId))!;
    // Just before the boundary: editable. Just after: locked.
    const justBefore = new Date(report.lockedAt.getTime() - 1000);
    const justAfter = new Date(report.lockedAt.getTime() + 1000);
    expect(isReportEditable(report, justBefore)).toBe(true);
    expect(isReportEditable(report, justAfter)).toBe(false);
    // Soft-deleted is never editable, even inside the window.
    expect(isReportEditable({ ...report, status: "deleted" }, justBefore)).toBe(
      false,
    );
  });

  it("softDeleteReport flips status + stamps deleted_at, ownership-scoped", async () => {
    const { id } = await createReport(db, fullInput());

    // Foreign user can't delete it (and gets no existence signal).
    expect(await softDeleteReport(db, id, otherId)).toBe(false);
    expect((await getReport(db, id, ownerId))!.status).toBe(
      "pending_moderation",
    );

    // Owner deletes: status flips, deleted_at is set, row survives.
    expect(await softDeleteReport(db, id, ownerId)).toBe(true);
    const deleted = (await getReport(db, id, ownerId))!;
    expect(deleted.status).toBe("deleted");
    expect(deleted.deletedAt).not.toBeNull();

    // Idempotent: a second delete is a no-op and doesn't re-stamp deleted_at.
    const firstStamp = deleted.deletedAt!.getTime();
    expect(await softDeleteReport(db, id, ownerId)).toBe(false);
    expect((await getReport(db, id, ownerId))!.deletedAt!.getTime()).toBe(
      firstStamp,
    );
  });

  it("purgeDeletedReportPii clears prose only for reports deleted past retention", async () => {
    const { id } = await createReport(db, fullInput());
    await softDeleteReport(db, id, ownerId);

    // Backdate the soft-delete to just past the 90-day retention boundary.
    const longAgo = new Date(Date.now() - PII_RETENTION_MS - 60_000);
    await db
      .update(interviewReports)
      .set({ deletedAt: longAgo })
      .where(eq(interviewReports.id, id));

    const cutoff = new Date(Date.now() - PII_RETENTION_MS);
    const res = await purgeDeletedReportPii(db, cutoff);
    expect(res.reportsPurged).toBe(1);

    // Round experience prose nulled; question prose redacted to "".
    const roundRows = await db
      .select()
      .from(rounds)
      .where(eq(rounds.reportId, id));
    expect(roundRows.every((r) => r.experienceProse === null)).toBe(true);
    const qRows = await db
      .select()
      .from(questions)
      .innerJoin(rounds, eq(rounds.id, questions.roundId))
      .where(eq(rounds.reportId, id));
    expect(qRows.every((q) => q.questions.questionProse === "")).toBe(true);

    // The report + its child rows still exist; pii_purged_at is stamped.
    const report = (await getReport(db, id, ownerId))!;
    expect(report.status).toBe("deleted");
    expect(report.piiPurgedAt).not.toBeNull();

    // Idempotent: a second pass finds nothing left to purge.
    expect((await purgeDeletedReportPii(db, cutoff)).reportsPurged).toBe(0);
  });

  it("purgeDeletedReportPii leaves recently-deleted reports untouched", async () => {
    const { id } = await createReport(db, fullInput());
    await softDeleteReport(db, id, ownerId); // deleted_at = now()

    // Cutoff is 90 days ago; a just-deleted report is well inside retention.
    const cutoff = new Date(Date.now() - PII_RETENTION_MS);
    expect((await purgeDeletedReportPii(db, cutoff)).reportsPurged).toBe(0);

    const roundRows = await db
      .select()
      .from(rounds)
      .where(eq(rounds.reportId, id));
    // Prose preserved during the retention window.
    expect(roundRows.some((r) => r.experienceProse !== null)).toBe(true);
    expect((await getReport(db, id, ownerId))!.piiPurgedAt).toBeNull();
  });

  it("purgeDeletedReportPii ignores live (non-deleted) reports", async () => {
    const { id } = await createReport(db, fullInput());
    // Never deleted — even an ancient cutoff must not touch it.
    const cutoff = new Date(Date.now() + PII_RETENTION_MS);
    expect((await purgeDeletedReportPii(db, cutoff)).reportsPurged).toBe(0);
    const report = (await getReport(db, id, ownerId))!;
    expect(report.piiPurgedAt).toBeNull();
    expect(report.deletedAt).toBeNull();
  });

  it("countVerifiedReportsForUser counts only verified, non-deleted reports", async () => {
    // Unverified report (the default) doesn't count.
    await createReport(db, fullInput());
    expect(await countVerifiedReportsForUser(db, ownerId)).toBe(0);

    // Flip one report to evidence_verified.
    const verified = await createReport(db, fullInput());
    await db
      .update(interviewReports)
      .set({ evidenceVerified: true })
      .where(eq(interviewReports.id, verified.id));
    expect(await countVerifiedReportsForUser(db, ownerId)).toBe(1);

    // A soft-deleted verified report drops out of the count.
    await softDeleteReport(db, verified.id, ownerId);
    expect(await countVerifiedReportsForUser(db, ownerId)).toBe(0);

    // Scoped to the user.
    expect(await countVerifiedReportsForUser(db, otherId)).toBe(0);
  });
});
