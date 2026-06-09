// Karma tier mapping — pure unit tests, no DB (Sprint 5 Day 8).

import { describe, expect, it } from "vitest";
import { karmaTier, KARMA_TIERS } from "../src/index.js";

describe("karmaTier", () => {
  it("has no tier below the first rung", () => {
    expect(karmaTier(0)).toBeNull();
    expect(karmaTier(9)).toBeNull();
    expect(karmaTier(-50)).toBeNull();
  });

  it("returns the exact tier at each threshold boundary", () => {
    expect(karmaTier(10)?.threshold).toBe(10);
    expect(karmaTier(100)?.threshold).toBe(100);
    expect(karmaTier(1000)?.threshold).toBe(1000);
  });

  it("returns the HIGHEST tier reached between/above thresholds", () => {
    expect(karmaTier(11)?.threshold).toBe(10);
    expect(karmaTier(99)?.threshold).toBe(10);
    expect(karmaTier(101)?.threshold).toBe(100);
    expect(karmaTier(50_000)?.threshold).toBe(1000);
  });

  it("labels match the configured tiers", () => {
    expect(karmaTier(10)?.label).toBe("Contributor");
    expect(karmaTier(100)?.label).toBe("Established");
    expect(karmaTier(1000)?.label).toBe("Distinguished");
  });

  it("KARMA_TIERS is ascending by threshold", () => {
    const thresholds = KARMA_TIERS.map((t) => t.threshold);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
  });
});
