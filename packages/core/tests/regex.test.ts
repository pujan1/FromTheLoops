// Content scanner unit tests — pure, no DB. Pins the block vs flag split and
// the false-positive guard that legitimate technical prose stays clean.

import { describe, expect, it } from "vitest";
import {
  firstBlockingMatch,
  scanText,
  scanTexts,
} from "../src/anti-abuse/regex.js";

describe("scanText", () => {
  it("blocks a bare 7-digit phone number", () => {
    const matches = scanText("call me at 555-1234");
    expect(matches).toContainEqual({
      category: "contact_info",
      severity: "block",
    });
  });

  it("blocks a 10-digit phone number with separators", () => {
    expect(scanText("reach me on (415) 555-2671")).toContainEqual({
      category: "contact_info",
      severity: "block",
    });
  });

  it("blocks an email address", () => {
    expect(scanText("ping me — jane.doe@example.com")).toContainEqual({
      category: "contact_info",
      severity: "block",
    });
  });

  it("blocks a US SSN", () => {
    expect(scanText("my ssn is 123-45-6789")).toContainEqual({
      category: "pii",
      severity: "block",
    });
  });

  it("flags (does not block) profanity", () => {
    const matches = scanText("the interviewer was an asshole");
    expect(matches).toEqual([{ category: "profanity", severity: "flag" }]);
    expect(firstBlockingMatch(["the interviewer was an asshole"])).toBeNull();
  });

  it("does not flag the mere words 'phone' or 'email'", () => {
    // The classic false positive the sprint risk note calls out.
    expect(scanText("Implement a phone field and validate the email format")).toEqual(
      [],
    );
  });

  it("does not match plain integers in prose", () => {
    expect(scanText("I solved 2 of 3 problems in 45 minutes")).toEqual([]);
    expect(scanText("Time complexity was around 1000 operations")).toEqual([]);
  });

  it("returns nothing for clean text", () => {
    expect(scanText("Great recursion question about binary trees.")).toEqual([]);
  });
});

describe("scanTexts / firstBlockingMatch", () => {
  it("dedupes to one match per category across many strings", () => {
    const texts = ["555-1234", "also 999-8765", "and bob@corp.io"];
    const matches = scanTexts(texts);
    // Two phones + an email all collapse to a single contact_info entry.
    expect(matches).toEqual([{ category: "contact_info", severity: "block" }]);
  });

  it("returns the first blocking match, ignoring flag-only content", () => {
    const texts = ["totally clean", "what an asshole", "ssn 123-45-6789"];
    expect(firstBlockingMatch(texts)).toEqual({
      category: "pii",
      severity: "block",
    });
  });

  it("returns null when nothing blocks", () => {
    expect(firstBlockingMatch(["clean prose", "more clean prose"])).toBeNull();
  });
});
