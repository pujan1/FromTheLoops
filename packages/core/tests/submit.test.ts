// finalizeSubmission end-to-end against a real Postgres. Covers the happy path
// (full tree written, draft consumed), suggested-taxonomy resolution
// (company + tag become pending rows and get linked), the validation gate
// (a bad draft writes nothing), and the edit branch (in-place rewrite, window
// preserved, locked/foreign targets rejected).

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from "vitest";
import { finalizeSubmission } from "../src/index.js";
import {
  companies,
  companyLevels,
  createDraft,
  type Database,
  getDraft,
  getReport,
  getOrCreateUserByClerkId,
  interviewReports,
  questions,
  questionTopics,
  roles,
  rounds,
  schema,
  topics,
  users,
} from "@fromtheloop/db";
import type { SubmissionDraft } from "@fromtheloop/shared";

const OWNER_CLERK = "clerk_core_owner";
const OTHER_CLERK = "clerk_core_other";

describe("finalizeSubmission", () => {
  let db: Database;
  let client: ReturnType<typeof postgres>;
  let ownerId: string;
  let otherId: string;
  let companyId: string;
  let roleId: string;
  let levelId: string;
  let topicId: string;

  beforeAll(async () => {
    client = postgres(inject("databaseUrl"), {
      max: 4,
      prepare: false,
      onnotice: () => {},
    });
    db = drizzle(client, { schema });

    ownerId = (await getOrCreateUserByClerkId(db, { clerkId: OWNER_CLERK })).id;
    otherId = (await getOrCreateUserByClerkId(db, { clerkId: OTHER_CLERK })).id;
    companyId = (
      await db
        .insert(companies)
        .values({ slug: "globex", name: "Globex", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    levelId = (
      await db
        .insert(companyLevels)
        .values({ companyId, slug: "l5", name: "L5", orderIndex: 0 })
        .returning({ id: companyLevels.id })
    )[0]!.id;
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "swe", name: "Software Engineer", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "recursion", name: "Recursion", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    // Reports RESTRICT user/taxonomy deletes — clear reports + any pending
    // taxonomy this file created, then the fixtures, then users.
    await db.delete(interviewReports).where(eq(interviewReports.createdByUserId, ownerId));
    await db.delete(topics).where(eq(topics.source, "user_suggested"));
    await db.delete(companies).where(eq(companies.source, "user_suggested"));
    await db.delete(companyLevels).where(eq(companyLevels.id, levelId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(users).where(inArray(users.clerkId, [OWNER_CLERK, OTHER_CLERK]));
    await client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await db.delete(interviewReports); // cascades children
    // Drop pending taxonomy created by suggested-resolution cases.
    await db.delete(topics).where(eq(topics.status, "pending"));
    await db.delete(companies).where(eq(companies.status, "pending"));
  });

  function validDraft(overrides: Partial<SubmissionDraft> = {}): SubmissionDraft {
    return {
      company: { kind: "existing", id: companyId, name: "Globex" },
      role: { id: roleId, name: "Software Engineer" },
      level: { id: levelId, name: "L5" },
      outcome: "offer",
      month: "2026-04",
      attribution: "anonymous",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experience: "  two problems  ",
          questions: [
            {
              prose: "  Reverse a tree  ",
              tags: [{ kind: "existing", id: topicId, slug: "recursion", name: "Recursion" }],
            },
          ],
        },
      ],
      ...overrides,
    };
  }

  it("writes a full report from a valid draft and consumes the draft", async () => {
    const draft = await createDraft(db, ownerId, validDraft());
    const res = await finalizeSubmission(db, {
      userId: ownerId,
      draftId: draft.id,
      data: draft.data,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const report = await getReport(db, res.reportId, ownerId);
    expect(report).not.toBeNull();
    expect(report!.interviewMonth).toBe("2026-04");
    expect(report!.level).toBe("L5");
    expect(report!.status).toBe("pending_moderation");

    const roundRows = await db.select().from(rounds).where(eq(rounds.reportId, res.reportId));
    expect(roundRows).toHaveLength(1);
    // experience prose trimmed by the validator.
    expect(roundRows[0]!.experienceProse).toBe("two problems");

    const qRows = await db
      .select()
      .from(questions)
      .where(eq(questions.roundId, roundRows[0]!.id));
    expect(qRows[0]!.questionProse).toBe("Reverse a tree");

    // Draft is gone.
    expect(await getDraft(db, draft.id, ownerId)).toBeNull();
  });

  it("resolves a suggested company and tag into pending rows and links them", async () => {
    const draft = validDraft({
      company: { kind: "suggested", name: "Initech" },
      rounds: [
        {
          roundType: "technical-phone",
          rating: "mixed",
          experience: null,
          questions: [
            {
              prose: "Explain tail calls",
              tags: [
                { kind: "existing", id: topicId, slug: "recursion", name: "Recursion" },
                { kind: "suggested", name: "Tail Calls" },
              ],
            },
          ],
        },
      ],
    });
    const res = await finalizeSubmission(db, { userId: ownerId, draftId: null, data: draft });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const report = await getReport(db, res.reportId, ownerId);
    const created = await db.select().from(companies).where(eq(companies.slug, "initech"));
    expect(created[0]!.status).toBe("pending");
    expect(report!.companyId).toBe(created[0]!.id);

    const newTag = await db.select().from(topics).where(eq(topics.slug, "tail-calls"));
    expect(newTag[0]!.status).toBe("pending");

    // The question carries BOTH the active and the freshly-pending tag.
    const qRows = await db
      .select({ id: questions.id })
      .from(questions)
      .innerJoin(rounds, eq(rounds.id, questions.roundId))
      .where(eq(rounds.reportId, res.reportId));
    const joins = await db
      .select()
      .from(questionTopics)
      .where(eq(questionTopics.questionId, qRows[0]!.id));
    expect(joins).toHaveLength(2);
  });

  it("rejects an invalid draft and writes nothing", async () => {
    // A round with no rating fails the gate.
    const draft = validDraft({
      rounds: [
        {
          roundType: "onsite-coding",
          rating: null,
          experience: null,
          questions: [],
        },
      ],
    });
    const res = await finalizeSubmission(db, { userId: ownerId, draftId: null, data: draft });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("invalid");

    const all = await db.select().from(interviewReports);
    expect(all).toHaveLength(0);
  });

  it("edits a report in place, preserving created_at / locked_at", async () => {
    const first = await finalizeSubmission(db, {
      userId: ownerId,
      draftId: null,
      data: validDraft(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const before = await getReport(db, first.reportId, ownerId);

    const edited = await finalizeSubmission(db, {
      userId: ownerId,
      draftId: null,
      editingReportId: first.reportId,
      data: validDraft({ outcome: "reject" }),
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    // Same report row, not a new one.
    expect(edited.reportId).toBe(first.reportId);

    const after = await getReport(db, first.reportId, ownerId);
    expect(after!.outcome).toBe("reject");
    expect(after!.createdAt.getTime()).toBe(before!.createdAt.getTime());
    expect(after!.lockedAt.getTime()).toBe(before!.lockedAt.getTime());
    expect(await db.select().from(interviewReports)).toHaveLength(1);
  });

  it("refuses to edit a report the user doesn't own", async () => {
    const mine = await finalizeSubmission(db, {
      userId: ownerId,
      draftId: null,
      data: validDraft(),
    });
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;

    const res = await finalizeSubmission(db, {
      userId: otherId,
      draftId: null,
      editingReportId: mine.reportId,
      data: validDraft(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("not_found");
  });

  it("refuses to edit a report past its locked_at window", async () => {
    const created = await finalizeSubmission(db, {
      userId: ownerId,
      draftId: null,
      data: validDraft(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Backdate the window so the report is now locked.
    await db
      .update(interviewReports)
      .set({ lockedAt: new Date(Date.now() - 1000) })
      .where(eq(interviewReports.id, created.reportId));

    const res = await finalizeSubmission(db, {
      userId: ownerId,
      draftId: null,
      editingReportId: created.reportId,
      data: validDraft({ outcome: "withdrew" }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("locked");
  });
});
