// Database constraint assertions.
//
// What this suite catches:
//   - "We changed an FK from CASCADE to RESTRICT (or vice versa) and
//     broke the soft-delete contract." → cascade tests fail loud.
//   - "We dropped a unique index, now we have two Stripes." → unique
//     tests fail loud.
//   - "We changed a pgEnum to text + check constraint and lost the
//     SQLSTATE 22P02 rejection on bad values." → enum test fails loud.
//
// Strategy: every test asserts via SQLSTATE codes (see helpers.ts), not
// message text. Drizzle wraps postgres-js errors so messages are
// unreliable; codes are stable.
//
// Truncation: afterEach truncates everything via helpers.truncateAll(),
// so each test starts from a known-empty state.

import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  interviewReports,
  questions,
  questionTopics,
  roles,
  rounds,
  topics,
  userVerifications,
  users,
} from "../src/schema/index.js";
import {
  PG_FK_VIOLATION,
  PG_INVALID_TEXT_REPRESENTATION,
  PG_UNIQUE_VIOLATION,
  expectPgError,
  makeTestClient,
  truncateAll,
  type TestDb,
} from "./helpers.js";

describe("constraints", () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(() => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
  });

  afterAll(async () => {
    await close();
  });

  afterEach(async () => {
    await truncateAll(db);
  });

  // Most constraint tests need a user + company + role + topic to FK
  // against. This helper inserts the minimum and returns the ids.
  async function seedBaseRefs(): Promise<{
    userId: string;
    companyId: string;
    roleId: string;
    topicId: string;
  }> {
    const [u] = await db
      .insert(users)
      .values({ clerkId: "clerk_test", username: "tester" })
      .returning();
    const [c] = await db
      .insert(companies)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const [r] = await db
      .insert(roles)
      .values({ slug: "swe", name: "Software Engineer" })
      .returning();
    const [t] = await db
      .insert(topics)
      .values({ slug: "system-design", name: "System Design" })
      .returning();
    if (!u || !c || !r || !t) throw new Error("seed failed");
    return { userId: u.id, companyId: c.id, roleId: r.id, topicId: t.id };
  }

  describe("foreign keys", () => {
    it("rejects an interview_report with a non-existent company_id", async () => {
      const { userId, roleId } = await seedBaseRefs();
      await expectPgError(
        db.insert(interviewReports).values({
          createdByUserId: userId,
          companyId: "00000000-0000-0000-0000-000000000000",
          canonicalRoleId: roleId,
          level: "L4",
        }),
        PG_FK_VIOLATION,
      );
    });

    it("cascades delete from interview_reports → rounds → questions", async () => {
      const { userId, companyId, roleId, topicId } = await seedBaseRefs();
      const [report] = await db
        .insert(interviewReports)
        .values({
          createdByUserId: userId,
          companyId,
          canonicalRoleId: roleId,
          level: "L4",
        })
        .returning();
      const [round] = await db
        .insert(rounds)
        .values({
          reportId: report!.id,
          orderIndex: 0,
          roundType: "onsite-coding",
          rating: "positive",
        })
        .returning();
      const [question] = await db
        .insert(questions)
        .values({
          roundId: round!.id,
          orderIndex: 0,
          questionProse: "Design a rate limiter.",
        })
        .returning();
      await db
        .insert(questionTopics)
        .values({ questionId: question!.id, topicId });

      await db.delete(interviewReports).where(eq(interviewReports.id, report!.id));

      const remaining = await db
        .execute<{ c: number }>(sql`
          SELECT (SELECT count(*) FROM rounds)::int
               + (SELECT count(*) FROM questions)::int
               + (SELECT count(*) FROM question_topics)::int AS c
        `);
      expect(remaining[0]?.c).toBe(0);
    });

    it("restricts deleting a user that has authored reports", async () => {
      const { userId, companyId, roleId } = await seedBaseRefs();
      await db.insert(interviewReports).values({
        createdByUserId: userId,
        companyId,
        canonicalRoleId: roleId,
        level: "L4",
      });

      await expectPgError(
        db.delete(users).where(eq(users.id, userId)),
        PG_FK_VIOLATION,
      );
    });

    it("cascades delete from users → user_verifications", async () => {
      const { userId, companyId } = await seedBaseRefs();
      await db.insert(userVerifications).values({
        userId,
        companyId,
        verifiedVia: "work_email",
        evidenceTokenHash: "hash",
      });
      // Detach the user from interviewReports first (none here) so the
      // RESTRICT on reports doesn't block — this test is about cascading
      // verifications specifically.
      await db.delete(users).where(eq(users.id, userId));
      const remaining = await db.select().from(userVerifications);
      expect(remaining).toHaveLength(0);
    });
  });

  describe("unique constraints", () => {
    it("rejects a duplicate companies.slug", async () => {
      await db.insert(companies).values({ slug: "stripe", name: "Stripe" });
      await expectPgError(
        db.insert(companies).values({ slug: "stripe", name: "Stripe Inc" }),
        PG_UNIQUE_VIOLATION,
      );
    });

    it("rejects two rounds with the same (report_id, order_index)", async () => {
      const { userId, companyId, roleId } = await seedBaseRefs();
      const [report] = await db
        .insert(interviewReports)
        .values({
          createdByUserId: userId,
          companyId,
          canonicalRoleId: roleId,
          level: "L4",
        })
        .returning();
      await db.insert(rounds).values({
        reportId: report!.id,
        orderIndex: 0,
        roundType: "onsite-coding",
        rating: "positive",
      });
      await expectPgError(
        db.insert(rounds).values({
          reportId: report!.id,
          orderIndex: 0,
          roundType: "onsite-behavioral",
          rating: "mixed",
        }),
        PG_UNIQUE_VIOLATION,
      );
    });
  });

  describe("enum constraints", () => {
    it("rejects an unknown value for round_type", async () => {
      const { userId, companyId, roleId } = await seedBaseRefs();
      const [report] = await db
        .insert(interviewReports)
        .values({
          createdByUserId: userId,
          companyId,
          canonicalRoleId: roleId,
          level: "L4",
        })
        .returning();
      // Bypass TS via a raw insert so we can verify the *database* rejects
      // the value, not just the type system.
      await expectPgError(
        db.execute(sql`
          INSERT INTO rounds (report_id, order_index, round_type, rating)
          VALUES (${report!.id}, 0, 'not-a-real-round'::round_type, 'positive')
        `),
        PG_INVALID_TEXT_REPRESENTATION,
      );
    });
  });
});
