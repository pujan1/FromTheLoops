import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { absoluteTime, relativeTime } from "./format";

// relativeTime is read off the wall clock, so we freeze it to make the
// boundaries (the s→m→h→d roll-ups) deterministic.
describe("relativeTime", () => {
  const now = new Date("2026-06-28T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("renders seconds under a minute", () => {
    expect(relativeTime(ago(12_000))).toBe("12s ago");
  });

  it("rolls up to minutes, hours, then days at each boundary", () => {
    expect(relativeTime(ago(5 * 60_000))).toBe("5m ago");
    expect(relativeTime(ago(3 * 3_600_000))).toBe("3h ago");
    expect(relativeTime(ago(8 * 86_400_000))).toBe("8d ago");
  });

  it("accepts an ISO string as well as a Date (RSC boundary serializes to string)", () => {
    expect(relativeTime(ago(12_000).toISOString())).toBe("12s ago");
  });
});

describe("absoluteTime", () => {
  it("returns the same medium-date / short-time string for a Date and its ISO form", () => {
    const d = new Date("2026-06-24T15:14:00Z");
    expect(absoluteTime(d)).toBe(absoluteTime(d.toISOString()));
  });
});
