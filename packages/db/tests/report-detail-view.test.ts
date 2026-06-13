// Pure mapper, no DB. The contract that matters for ADR-0010: the view that
// crosses the wire to the client triage pane is JSON-safe — none of the `Date`
// fields ReportDetail.report carries (createdAt/lockedAt/deletedAt) may leak into
// it — and it carries exactly the presentational content the shared
// <ReportDetailBody> renders.

import { describe, expect, it } from "vitest";
import { type ReportDetail, toReportDetailView } from "../src/index.js";

// A minimal ReportDetail; cast past the full InterviewReport column set (the
// mapper only touches the handful of fields below). The `report` carries Date
// fields on purpose — they must be dropped.
const detail = {
  report: {
    id: "rep-1",
    outcome: "offer",
    evidenceVerified: true,
    createdAt: new Date(),
    lockedAt: new Date(),
    deletedAt: null,
  },
  company: { id: "c1", slug: "acme", name: "Acme" },
  role: { id: "r1", slug: "swe", name: "Software Engineer" },
  level: { id: "l1", name: "L4" },
  interviewMonth: "2026-03",
  outcome: "offer",
  displayAttribution: "anonymous",
  rounds: [
    {
      roundType: "technical",
      rating: "positive",
      experienceProse: "Two algo questions.",
      questions: [
        { id: "q1", prose: "Reverse a list", topics: [{ id: "t1", slug: "arrays", name: "Arrays" }] },
      ],
    },
  ],
} as unknown as ReportDetail;

describe("toReportDetailView", () => {
  it("carries exactly the presentational content", () => {
    expect(toReportDetailView(detail)).toEqual({
      id: "rep-1",
      companyName: "Acme",
      roleName: "Software Engineer",
      levelName: "L4",
      interviewMonth: "2026-03",
      outcome: "offer",
      evidenceVerified: true,
      rounds: detail.rounds,
    });
  });

  it("is JSON-safe — no Date fields leak across the wire", () => {
    const view = toReportDetailView(detail);
    // A JSON round-trip is a no-op iff nothing non-serializable rode along.
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    for (const value of Object.values(view)) {
      expect(value).not.toBeInstanceOf(Date);
    }
  });
});
