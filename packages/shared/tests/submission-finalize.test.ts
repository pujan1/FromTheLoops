import { describe, expect, it } from "vitest";
import {
  type SubmissionValidation,
  validateFinalSubmission,
} from "../src/submission.js";

// A complete, valid top-level + rounds payload. Helpers below clone-and-mutate
// it so each test perturbs exactly one rule.
const COMPANY = { kind: "existing" as const, id: crypto.randomUUID(), name: "Acme" };
const ROLE = { id: crypto.randomUUID(), name: "Software Engineer" };
const LEVEL = { id: crypto.randomUUID(), name: "L4" };
const ACTIVE_TAG = {
  kind: "existing" as const,
  id: crypto.randomUUID(),
  slug: "binary-search",
  name: "Binary search",
};
const SUGGESTED_TAG = { kind: "suggested" as const, name: "Quantum sorting" };

function validBasics() {
  return {
    company: COMPANY,
    role: ROLE,
    level: LEVEL,
    outcome: "offer" as const,
    month: "2026-05",
    attribution: "anonymous" as const,
  };
}

function validRound() {
  return {
    roundType: "onsite-coding" as const,
    rating: "positive" as const,
    experience: "Two LC-mediums.",
    questions: [{ prose: "Reverse a linked list.", tags: [ACTIVE_TAG] }],
  };
}

function expectOk(result: SubmissionValidation) {
  if (!result.ok) {
    throw new Error(`expected ok, got issues: ${JSON.stringify(result.issues)}`);
  }
  return result.data;
}

describe("validateFinalSubmission", () => {
  it("accepts a complete report with one fully-specified round", () => {
    const data = expectOk(
      validateFinalSubmission({ ...validBasics(), rounds: [validRound()] }),
    );
    expect(data.rounds).toHaveLength(1);
    expect(data.rounds[0]!.roundType).toBe("onsite-coding");
    expect(data.rounds[0]!.questions[0]!.tags).toHaveLength(1);
  });

  it("accepts a basics-only report with zero rounds", () => {
    const data = expectOk(validateFinalSubmission({ ...validBasics(), rounds: [] }));
    expect(data.rounds).toEqual([]);
  });

  it("accepts a missing rounds key (older draft shape) as zero rounds", () => {
    const data = expectOk(validateFinalSubmission(validBasics()));
    expect(data.rounds).toEqual([]);
  });

  it("treats outcome as optional", () => {
    const { outcome: _drop, ...noOutcome } = validBasics();
    const data = expectOk(validateFinalSubmission({ ...noOutcome, rounds: [] }));
    expect(data.outcome).toBeNull();
  });

  it("flags missing top-level fields", () => {
    const result = validateFinalSubmission({
      attribution: "anonymous",
      rounds: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.company).toBe(true);
    expect(result.issues.role).toBe(true);
    expect(result.issues.level).toBe(true);
    expect(result.issues.month).toBe(true);
  });

  it("requires round_type and rating once a round exists", () => {
    const result = validateFinalSubmission({
      ...validBasics(),
      rounds: [{ experience: "", questions: [] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.rounds[0]!.roundType).toBe(true);
    expect(result.issues.rounds[0]!.rating).toBe(true);
  });

  it("requires non-blank prose for each question", () => {
    const result = validateFinalSubmission({
      ...validBasics(),
      rounds: [{ ...validRound(), questions: [{ prose: "   ", tags: [ACTIVE_TAG] }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.rounds[0]!.questions[0]!.prose).toBe(true);
    expect(result.issues.rounds[0]!.questions[0]!.tags).toBe(false);
  });

  it("requires at least one tag per question", () => {
    const result = validateFinalSubmission({
      ...validBasics(),
      rounds: [{ ...validRound(), questions: [{ prose: "Q?", tags: [] }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.rounds[0]!.questions[0]!.tags).toBe(true);
  });

  it("does NOT count a suggested (pending) tag toward the ≥1-tag rule", () => {
    const result = validateFinalSubmission({
      ...validBasics(),
      rounds: [{ ...validRound(), questions: [{ prose: "Q?", tags: [SUGGESTED_TAG] }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.rounds[0]!.questions[0]!.tags).toBe(true);
  });

  it("accepts a question carrying both an active and a suggested tag", () => {
    const data = expectOk(
      validateFinalSubmission({
        ...validBasics(),
        rounds: [
          {
            ...validRound(),
            questions: [{ prose: "Q?", tags: [ACTIVE_TAG, SUGGESTED_TAG] }],
          },
        ],
      }),
    );
    expect(data.rounds[0]!.questions[0]!.tags).toHaveLength(2);
  });

  it("normalizes blank experience to null and trims prose", () => {
    const data = expectOk(
      validateFinalSubmission({
        ...validBasics(),
        rounds: [
          {
            roundType: "take-home",
            rating: "mixed",
            experience: "   ",
            questions: [{ prose: "  trim me  ", tags: [ACTIVE_TAG] }],
          },
        ],
      }),
    );
    expect(data.rounds[0]!.experience).toBeNull();
    expect(data.rounds[0]!.questions[0]!.prose).toBe("trim me");
  });

  it("marks a wholly malformed payload as malformed", () => {
    const result = validateFinalSubmission("not an object");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.malformed).toBe(true);
  });
});
