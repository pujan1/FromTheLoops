import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD, isHoneypotTripped } from "../src/anti-abuse.js";

describe("isHoneypotTripped", () => {
  it("trips on any non-empty string (a bot typed in the decoy)", () => {
    expect(isHoneypotTripped("http://spam.example")).toBe(true);
    expect(isHoneypotTripped("x")).toBe(true);
    expect(isHoneypotTripped("  padded  ")).toBe(true);
  });

  it("does not trip on the blank/missing values a real client sends", () => {
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped("   ")).toBe(false); // whitespace-only is blank
    expect(isHoneypotTripped(undefined)).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
  });

  it("does not trip on non-string types (only a string field is the trap)", () => {
    expect(isHoneypotTripped(0)).toBe(false);
    expect(isHoneypotTripped(false)).toBe(false);
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped([])).toBe(false);
  });

  it("exposes a stable, plausible-looking field name", () => {
    // The name is part of the contract between the form input and the action;
    // it must look like a real field so bots target it.
    expect(HONEYPOT_FIELD).toBe("website");
  });
});
