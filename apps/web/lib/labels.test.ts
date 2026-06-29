import { describe, expect, it } from "vitest";
import {
  levelLabel,
  outcomeLabel,
  OUTCOME_BADGE,
  OUTCOME_LABEL,
  ROUND_TYPE_LABEL,
  roundTypeLabel,
} from "./labels";

describe("roundTypeLabel", () => {
  it("maps a known wire value to its human label", () => {
    expect(roundTypeLabel("onsite-system-design")).toBe("System design");
  });

  it("de-hyphenates an unknown value rather than dropping it (forward-compat with newer enums)", () => {
    expect(roundTypeLabel("future-round-type")).toBe("future round type");
  });
});

describe("outcomeLabel", () => {
  it("maps known outcomes", () => {
    expect(outcomeLabel("offer")).toBe("Offer");
  });

  it("renders null/missing as 'Outcome pending'", () => {
    expect(outcomeLabel(null)).toBe("Outcome pending");
  });

  it("passes an unknown outcome through unchanged", () => {
    expect(outcomeLabel("rescinded")).toBe("rescinded");
  });
});

describe("levelLabel", () => {
  it("renders the skipped-level sentinels as 'Unspecified'", () => {
    // Guards the level signal's honesty: a blank must never read as a concrete
    // level. Both the current and legacy sentinels collapse to one label.
    expect(levelLabel("Unspecified")).toBe("Unspecified");
    expect(levelLabel("N/A")).toBe("Unspecified");
  });

  it("passes a real level through", () => {
    expect(levelLabel("L5")).toBe("L5");
  });
});

describe("enum maps stay total", () => {
  // Each outcome label must have a matching badge severity — they're consumed
  // together, so a missing badge would render an unstyled chip.
  it("every outcome label has a badge severity", () => {
    expect(Object.keys(OUTCOME_BADGE).sort()).toEqual(
      Object.keys(OUTCOME_LABEL).sort(),
    );
  });

  it("round-type map is non-empty and includes the catch-all", () => {
    expect(ROUND_TYPE_LABEL.other).toBe("Other");
  });
});
