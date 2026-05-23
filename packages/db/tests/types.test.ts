// Compile-time schema-type assertions.
//
// What this suite catches (at BUILD time, before any container starts):
//   - "Someone added a new value to PLAN.md's round type list but
//     forgot to update the pgEnum." → expectTypeOf union mismatch.
//   - "Someone refactored a column from NOT NULL to nullable and didn't
//     update call sites." → nullability assertion fails.
//   - "Someone removed a required field from an Insert type." →
//     toMatchTypeOf assertion fails.
//
// These tests never execute meaningful runtime code; `expectTypeOf` is
// pure type-level. Their value is that `pnpm typecheck` AND `pnpm test`
// both fail on schema drift — you can't merge a regression by ignoring
// the test runner.

import { describe, expectTypeOf, it } from "vitest";
import type {
  InterviewReport,
  ModActionLog,
  NewInterviewReport,
  NewRound,
  Round,
  UserVerification,
} from "../src/schema/index.js";

describe("schema types", () => {
  it("InterviewReport.outcome is the exact enum union (nullable)", () => {
    expectTypeOf<InterviewReport["outcome"]>().toEqualTypeOf<
      "offer" | "reject" | "withdrew" | "ghosted" | "pending" | null
    >();
  });

  it("InterviewReport.status is the exact non-null enum union", () => {
    expectTypeOf<InterviewReport["status"]>().toEqualTypeOf<
      "active" | "pending_moderation" | "deleted"
    >();
  });

  it("InterviewReport.source is the exact non-null enum union", () => {
    expectTypeOf<InterviewReport["source"]>().toEqualTypeOf<
      "seed_dummy" | "seed_curated" | "user_submitted" | "imported"
    >();
  });

  it("Round.roundType covers every PLAN.md round type", () => {
    expectTypeOf<Round["roundType"]>().toEqualTypeOf<
      | "recruiter-screen"
      | "technical-phone"
      | "onsite-coding"
      | "onsite-system-design"
      | "onsite-behavioral"
      | "take-home"
      | "hiring-manager"
      | "exec-final"
      | "other"
    >();
  });

  it("Round.rating is positive | mixed | negative", () => {
    expectTypeOf<Round["rating"]>().toEqualTypeOf<
      "positive" | "mixed" | "negative"
    >();
  });

  it("UserVerification.verifiedVia is the exact enum union", () => {
    expectTypeOf<UserVerification["verifiedVia"]>().toEqualTypeOf<
      "work_email" | "linkedin" | "manual"
    >();
  });

  it("ModActionLog.actionType is the exact enum union", () => {
    expectTypeOf<ModActionLog["actionType"]>().toEqualTypeOf<
      "approve" | "reject" | "merge" | "ban" | "delete" | "edit_taxonomy"
    >();
  });

  it("NewInterviewReport allows optional fields with defaults", () => {
    // source, status, evidenceVerified, displayAttribution all have defaults
    // so they should be optional on insert; the required FKs and level stay
    // required.
    type Required = "createdByUserId" | "companyId" | "canonicalRoleId" | "level";
    expectTypeOf<Pick<NewInterviewReport, Required>>().toMatchTypeOf<{
      createdByUserId: string;
      companyId: string;
      canonicalRoleId: string;
      level: string;
    }>();
  });

  it("NewRound requires reportId, orderIndex, roundType, rating", () => {
    expectTypeOf<
      Pick<NewRound, "reportId" | "orderIndex" | "roundType" | "rating">
    >().toMatchTypeOf<{
      reportId: string;
      orderIndex: number;
      roundType: Round["roundType"];
      rating: Round["rating"];
    }>();
  });
});
