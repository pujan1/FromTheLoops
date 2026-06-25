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
  Comment,
  Company,
  CompanyLevel,
  Draft,
  InterviewReport,
  ModActionLog,
  NewInterviewReport,
  NewRound,
  Role,
  Round,
  Topic,
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
      "active" | "pending_moderation" | "rejected" | "deleted"
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
      | "approve"
      | "reject"
      | "merge"
      | "ban"
      | "delete"
      | "hide"
      | "edit_taxonomy"
      | "restore"
    >();
  });

  it("Comment.status is the exact enum union", () => {
    expectTypeOf<Comment["status"]>().toEqualTypeOf<
      "active" | "hidden" | "deleted"
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

  it("Company.status / Role.status / CompanyLevel.status share taxonomy_status", () => {
    expectTypeOf<Company["status"]>().toEqualTypeOf<
      "active" | "pending" | "merged" | "rejected"
    >();
    expectTypeOf<Role["status"]>().toEqualTypeOf<
      "active" | "pending" | "merged" | "rejected"
    >();
    expectTypeOf<CompanyLevel["status"]>().toEqualTypeOf<
      "active" | "pending" | "merged" | "rejected"
    >();
  });

  it("Company.source is the exact taxonomy_source union", () => {
    expectTypeOf<Company["source"]>().toEqualTypeOf<
      "seed_curated" | "user_suggested"
    >();
  });

  it("Topic shares the taxonomy status/source/aliases shape", () => {
    expectTypeOf<Topic["status"]>().toEqualTypeOf<
      "active" | "pending" | "merged" | "rejected"
    >();
    expectTypeOf<Topic["source"]>().toEqualTypeOf<
      "seed_curated" | "user_suggested"
    >();
    expectTypeOf<Topic["aliases"]>().toEqualTypeOf<string[]>();
    expectTypeOf<Topic["suggestedByUserId"]>().toEqualTypeOf<string | null>();
  });

  it("Topic.category is the nullable topic_category union", () => {
    expectTypeOf<Topic["category"]>().toEqualTypeOf<
      | "algorithms"
      | "system-design"
      | "fundamentals"
      | "machine-learning"
      | "data-engineering"
      | "infrastructure"
      | "behavioral"
      | null
    >();
  });

  it("Company.aliases is a non-null string[]; domain + suggestedBy are nullable", () => {
    expectTypeOf<Company["aliases"]>().toEqualTypeOf<string[]>();
    expectTypeOf<Company["domain"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Company["suggestedByUserId"]>().toEqualTypeOf<string | null>();
  });

  it("Role.mergedIntoId is a nullable self-FK", () => {
    expectTypeOf<Role["mergedIntoId"]>().toEqualTypeOf<string | null>();
  });

  it("InterviewReport.levelId is the nullable company_levels FK", () => {
    expectTypeOf<InterviewReport["levelId"]>().toEqualTypeOf<string | null>();
  });

  it("Draft.data is a non-null record", () => {
    expectTypeOf<Draft["data"]>().toEqualTypeOf<Record<string, unknown>>();
  });
});
