// Sparse-data fallback — pure unit tests, no DB. Pins the broadening ladder
// (exact → role → tag) and the Sprint 3 exit criterion: 'exact' at ≥10 reports,
// a broadened scope below 10.

import { describe, expect, it } from "vitest";
import {
  decideLevelView,
  decideScope,
  SPARSE_REPORT_THRESHOLD,
  type ScopeReportCounts,
} from "../src/index.js";

const counts = (over: Partial<ScopeReportCounts> = {}): ScopeReportCounts => ({
  exact: 0,
  role: 0,
  tag: 0,
  ...over,
});

describe("decideScope", () => {
  it("renders 'exact' when the cell has ≥10 reports (exit criterion)", () => {
    const d = decideScope(counts({ exact: 10, role: 50, tag: 999 }));
    expect(d.scope).toBe("exact");
    expect(d.count).toBe(10);
    expect(d.broadened).toBe(false);
  });

  it("exactly at the threshold is 'exact' (≥, not >)", () => {
    expect(decideScope(counts({ exact: SPARSE_REPORT_THRESHOLD })).scope).toBe(
      "exact",
    );
  });

  it("broadens to 'role' when the cell is sparse but the role corpus is not", () => {
    const d = decideScope(counts({ exact: 9, role: 40, tag: 999 }));
    expect(d.scope).toBe("role");
    expect(d.count).toBe(40);
    expect(d.broadened).toBe(true);
  });

  it("falls back to 'tag' when even the company+role corpus is thin", () => {
    const d = decideScope(counts({ exact: 2, role: 6, tag: 500 }));
    expect(d.scope).toBe("tag");
    expect(d.count).toBe(500);
    expect(d.broadened).toBe(true);
  });

  it("returns 'tag' for a brand-new cell with zero reports everywhere", () => {
    const d = decideScope(counts());
    expect(d.scope).toBe("tag");
    expect(d.broadened).toBe(true);
  });

  it("honours a custom threshold", () => {
    // With threshold 3, a 5-report cell stands on its own.
    expect(decideScope(counts({ exact: 5, role: 20 }), 3).scope).toBe("exact");
    // With the default 10, the same cell broadens.
    expect(decideScope(counts({ exact: 5, role: 20 })).scope).toBe("role");
  });

  it("does not broaden past 'exact' even if wider corpora are larger", () => {
    // A healthy exact cell wins regardless of how big role/tag are.
    expect(
      decideScope(counts({ exact: 12, role: 1000, tag: 100000 })).broadened,
    ).toBe(false);
  });
});

// Role-primary amendment: a level view stands alone when dense, else broadens to
// the role aggregate (no tag rung — the role grain is the floor).
describe("decideLevelView", () => {
  it("renders the level cell when it has ≥10 reports", () => {
    const d = decideLevelView(15);
    expect(d.view).toBe("level");
    expect(d.broadened).toBe(false);
  });

  it("exactly at the threshold renders the level cell (≥, not >)", () => {
    expect(decideLevelView(SPARSE_REPORT_THRESHOLD).view).toBe("level");
  });

  it("broadens to the role aggregate when the level cell is thin", () => {
    const d = decideLevelView(9);
    expect(d.view).toBe("role");
    expect(d.broadened).toBe(true);
  });

  it("a level with no cell (0, e.g. the Unspecified sentinel) broadens", () => {
    expect(decideLevelView(0).view).toBe("role");
  });
});
