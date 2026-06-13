// Comments (ADR-0011): the write guards (empty / too-long / active-report-only /
// rate limit / quote+reply integrity), the quote snapshot's stability across a
// later question edit, edit/soft-delete, and the anonymity-safe thread read —
// including authorLabel suppression, server-computed viewerIsAuthor, the inlined
// reply preview + its [deleted] placeholder, and newest/top sort. Taxonomy is
// isolated by this suite's slugs; reports (and their cascading comments) are
// cleared in beforeEach.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_RATE_LIMIT,
  companies,
  comments,
  countCommentsForReport,
  countCommentsForReports,
  createComment,
  createReport,
  editComment,
  getOrCreateUserByClerkId,
  interviewReports,
  listCommentsForReport,
  questions,
  type ReportWriteInput,
  roles,
  rounds,
  softDeleteComment,
  topics,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("comments", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let aliceId: string; // report author
  let bobId: string; // a commenter (display_name)
  let carolId: string; // another commenter (anonymous)
  let companyId: string;
  let roleId: string;
  let topicId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });

    aliceId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_cm_alice" })).id;
    bobId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_cm_bob" })).id;
    carolId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_cm_carol" })).id;
    // Bob has a display name so an attributed comment can render a label.
    await db.update(users).set({ displayName: "Bob Q" }).where(eq(users.id, bobId));

    companyId = (
      await db
        .insert(companies)
        .values({ slug: "cmco", name: "CmCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "cm-swe", name: "Cm SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db
        .insert(topics)
        .values({ slug: "cm-arrays", name: "Arrays", status: "active" })
        .returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    await db.delete(interviewReports).where(eq(interviewReports.companyId, companyId));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(users).where(inArray(users.id, [aliceId, bobId, carolId]));
    await close();
  });

  beforeEach(async () => {
    // Reports cascade-delete their comments + likes.
    await db.delete(interviewReports).where(eq(interviewReports.companyId, companyId));
  });

  // A report via the normal write path; returns its id + its single question id.
  async function makeReport(): Promise<{ reportId: string; questionId: string }> {
    const input: ReportWriteInput = {
      createdByUserId: aliceId,
      companyId,
      canonicalRoleId: roleId,
      level: "L4",
      levelId: null,
      interviewMonth: "2026-02",
      outcome: "offer",
      displayAttribution: "anonymous",
      status: "active",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: "Loop.",
          questions: [{ prose: "Reverse a linked list in place.", topicIds: [topicId] }],
        },
      ],
    };
    const { id: reportId } = await createReport(db, input);
    const q = await db
      .select({ id: questions.id })
      .from(questions)
      .innerJoin(rounds, eq(rounds.id, questions.roundId))
      .where(eq(rounds.reportId, reportId))
      .limit(1);
    return { reportId, questionId: q[0]!.id };
  }

  it("creates a plain comment on an active report", async () => {
    const { reportId } = await makeReport();
    const res = await createComment(db, {
      reportId,
      authorUserId: bobId,
      body: "  How long was the onsite?  ",
      displayAttribution: "display_name",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.comment.body).toBe("How long was the onsite?"); // trimmed
    expect(res.comment.status).toBe("active");
    expect(await countCommentsForReport(db, reportId)).toBe(1);
  });

  it("refuses empty / whitespace-only and over-long bodies", async () => {
    const { reportId } = await makeReport();
    expect(await createComment(db, { reportId, authorUserId: bobId, body: "   " })).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(
      await createComment(db, {
        reportId,
        authorUserId: bobId,
        body: "x".repeat(COMMENT_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, reason: "too_long" });
  });

  it("refuses a comment on a non-active report", async () => {
    const { reportId } = await makeReport();
    await db
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(interviewReports.id, reportId));
    expect(
      await createComment(db, { reportId, authorUserId: bobId, body: "hi" }),
    ).toEqual({ ok: false, reason: "report_not_available" });
  });

  it("snapshots the quoted question, and the snapshot survives a later edit", async () => {
    const { reportId, questionId } = await makeReport();
    const res = await createComment(db, {
      reportId,
      authorUserId: bobId,
      body: "I got this exact one!",
      quotedQuestionId: questionId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.comment.quotedText).toBe("Reverse a linked list in place.");
    expect(res.comment.quotedQuestionId).toBe(questionId);

    // Author rewrites the question; the frozen snapshot must not move.
    await db
      .update(questions)
      .set({ questionProse: "Totally different question now." })
      .where(eq(questions.id, questionId));
    const reread = await db
      .select({ quotedText: comments.quotedText })
      .from(comments)
      .where(eq(comments.id, res.comment.id));
    expect(reread[0]!.quotedText).toBe("Reverse a linked list in place.");
  });

  it("refuses a quote of a question from another report", async () => {
    const { reportId } = await makeReport();
    const { questionId: foreignQ } = await makeReport();
    expect(
      await createComment(db, {
        reportId,
        authorUserId: bobId,
        body: "wrong report",
        quotedQuestionId: foreignQ,
      }),
    ).toEqual({ ok: false, reason: "invalid_quote" });
  });

  it("refuses a reply to a comment that isn't an active comment on this report", async () => {
    const { reportId } = await makeReport();
    expect(
      await createComment(db, {
        reportId,
        authorUserId: bobId,
        body: "reply to nothing",
        replyToCommentId: "00000000-0000-0000-0000-000000000000",
      }),
    ).toEqual({ ok: false, reason: "invalid_reply" });
  });

  it("enforces the rolling posting rate limit", async () => {
    const { reportId } = await makeReport();
    // Pre-load Bob to the cap with bare rows in the window.
    await db.insert(comments).values(
      Array.from({ length: COMMENT_RATE_LIMIT }, () => ({
        reportId,
        authorUserId: bobId,
        body: "filler",
      })),
    );
    expect(
      await createComment(db, { reportId, authorUserId: bobId, body: "one too many" }),
    ).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("defaults attribution to the author's account default", async () => {
    const { reportId } = await makeReport();
    await db
      .update(users)
      .set({ defaultDisplayAttribution: "display_name" })
      .where(eq(users.id, bobId));
    const res = await createComment(db, { reportId, authorUserId: bobId, body: "defaulted" });
    expect(res.ok && res.comment.displayAttribution).toBe("display_name");
    // reset for other tests
    await db
      .update(users)
      .set({ defaultDisplayAttribution: "anonymous" })
      .where(eq(users.id, bobId));
  });

  it("edit stamps edited_at; soft-delete keeps the row but hides it from the count", async () => {
    const { reportId } = await makeReport();
    const created = await createComment(db, { reportId, authorUserId: bobId, body: "typo heer" });
    if (!created.ok) throw new Error("setup");
    const id = created.comment.id;

    const edited = await editComment(db, { commentId: id, authorUserId: bobId, body: "typo here" });
    expect(edited.ok && edited.comment.body).toBe("typo here");
    expect(edited.ok && edited.comment.editedAt).not.toBeNull();

    // A non-owner can't edit or delete.
    expect(await editComment(db, { commentId: id, authorUserId: carolId, body: "hijack" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await softDeleteComment(db, { commentId: id, authorUserId: carolId })).toEqual({ ok: false });

    expect(await softDeleteComment(db, { commentId: id, authorUserId: bobId })).toEqual({ ok: true });
    expect(await countCommentsForReport(db, reportId)).toBe(0);
  });

  it("read suppresses anonymous author identity and computes viewerIsAuthor", async () => {
    const { reportId } = await makeReport();
    await createComment(db, {
      reportId,
      authorUserId: bobId,
      body: "named",
      displayAttribution: "display_name",
    });
    await createComment(db, {
      reportId,
      authorUserId: carolId,
      body: "secret",
      displayAttribution: "anonymous",
    });

    const asCarol = await listCommentsForReport(db, { reportId, viewerId: carolId });
    const named = asCarol.find((c) => c.body === "named")!;
    const anon = asCarol.find((c) => c.body === "secret")!;
    expect(named.authorLabel).toBe("Bob Q");
    expect(anon.authorLabel).toBeNull(); // anonymity preserved
    expect(anon.viewerIsAuthor).toBe(true); // Carol owns it
    expect(named.viewerIsAuthor).toBe(false);

    // A signed-out reader owns nothing.
    const anonView = await listCommentsForReport(db, { reportId, viewerId: null });
    expect(anonView.every((c) => c.viewerIsAuthor === false)).toBe(true);
  });

  it("inlines an anonymity-safe reply preview, and shows [deleted] when the parent goes", async () => {
    const { reportId } = await makeReport();
    const parent = await createComment(db, {
      reportId,
      authorUserId: bobId,
      body: "Parent body that is fairly long for a preview snippet.",
      displayAttribution: "display_name",
    });
    if (!parent.ok) throw new Error("setup");
    await createComment(db, {
      reportId,
      authorUserId: carolId,
      body: "replying",
      replyToCommentId: parent.comment.id,
    });

    let list = await listCommentsForReport(db, { reportId, viewerId: null });
    const reply = list.find((c) => c.body === "replying")!;
    expect(reply.replyTo).not.toBeNull();
    expect(reply.replyTo!.authorLabel).toBe("Bob Q");
    expect(reply.replyTo!.snippet).toContain("Parent body");
    expect(reply.replyTo!.status).toBe("active");

    // Soft-delete the parent: it stays in the list (still referenced) as a
    // placeholder with no body, and the reply's preview reflects the deletion.
    await softDeleteComment(db, { commentId: parent.comment.id, authorUserId: bobId });
    list = await listCommentsForReport(db, { reportId, viewerId: null });
    const parentRow = list.find((c) => c.id === parent.comment.id)!;
    expect(parentRow.status).toBe("deleted");
    expect(parentRow.body).toBeNull(); // body suppressed for non-active
    const reply2 = list.find((c) => c.body === "replying")!;
    expect(reply2.replyTo!.status).toBe("deleted");
    expect(reply2.replyTo!.snippet).toBeNull();
  });

  it("counts comments per report in one batched read", async () => {
    const { reportId: a } = await makeReport();
    const { reportId: b } = await makeReport();
    await createComment(db, { reportId: a, authorUserId: bobId, body: "1" });
    await createComment(db, { reportId: a, authorUserId: carolId, body: "2" });
    await createComment(db, { reportId: b, authorUserId: bobId, body: "3" });

    const counts = await countCommentsForReports(db, [a, b]);
    expect(counts.get(a)).toBe(2);
    expect(counts.get(b)).toBe(1);
    // Empty input short-circuits to an empty map.
    expect((await countCommentsForReports(db, [])).size).toBe(0);
  });
});
