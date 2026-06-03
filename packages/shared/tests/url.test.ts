import { describe, expect, it } from "vitest";
import {
  buildQueryString,
  buildReportFiltersQuery,
  parseReportFilters,
  reportFiltersSchema,
} from "../src/url.js";

describe("parseReportFilters", () => {
  it("returns all defaults for an empty input", () => {
    expect(parseReportFilters({})).toEqual({
      q: "",
      outcome: undefined,
      roundType: undefined,
      topics: [],
      sort: "recent",
      page: 1,
      perPage: 20,
    });
  });

  it("reads valid params, coercing numbers", () => {
    const f = parseReportFilters({
      q: "  staff swe  ",
      outcome: "offer",
      roundType: "take-home",
      sort: "helpful",
      page: "3",
      perPage: "50",
    });
    expect(f.q).toBe("staff swe");
    expect(f.outcome).toBe("offer");
    expect(f.roundType).toBe("take-home");
    expect(f.sort).toBe("helpful");
    expect(f.page).toBe(3);
    expect(f.perPage).toBe(50);
  });

  it("degrades malformed params to their defaults instead of throwing", () => {
    const f = parseReportFilters({
      outcome: "not-an-outcome",
      roundType: "bogus",
      sort: "sideways",
      page: "abc",
      perPage: "9999", // over MAX_PER_PAGE
    });
    expect(f.outcome).toBeUndefined();
    expect(f.roundType).toBeUndefined();
    expect(f.sort).toBe("recent");
    expect(f.page).toBe(1);
    expect(f.perPage).toBe(20);
  });

  it("accepts topics as repeated keys or a comma list, trimmed and de-duped", () => {
    expect(parseReportFilters({ topics: ["payments", "payments", " ml "] }).topics).toEqual([
      "payments",
      "ml",
    ]);
    expect(parseReportFilters({ topics: "payments, system-design ,payments" }).topics).toEqual([
      "payments",
      "system-design",
    ]);
  });

  it("parses a real URLSearchParams instance", () => {
    const params = new URLSearchParams("q=stripe&topics=a&topics=b&page=2");
    const f = parseReportFilters(params);
    expect(f.q).toBe("stripe");
    expect(f.topics).toEqual(["a", "b"]);
    expect(f.page).toBe(2);
  });
});

describe("buildReportFiltersQuery", () => {
  it("omits every field still at its default (pristine view is a bare URL)", () => {
    const f = parseReportFilters({});
    expect(buildReportFiltersQuery(f)).toBe("");
  });

  it("emits only non-default fields, in stable sorted order", () => {
    const f = parseReportFilters({
      q: "stripe",
      sort: "helpful",
      page: "2",
      topics: ["payments", "system-design"],
    });
    expect(buildReportFiltersQuery(f)).toBe(
      "?page=2&q=stripe&sort=helpful&topics=payments&topics=system-design",
    );
  });

  it("round-trips: parse → build → parse is stable", () => {
    const input = { q: "anthropic", outcome: "reject", page: "4", topics: "ml,writing" };
    const once = parseReportFilters(input);
    const twice = parseReportFilters(
      new URLSearchParams(buildReportFiltersQuery(once).replace(/^\?/, "")),
    );
    expect(twice).toEqual(once);
  });
});

describe("buildQueryString", () => {
  it("drops empties and sorts keys", () => {
    expect(
      buildQueryString({ b: "2", a: "1", empty: "", missing: undefined, none: null }),
    ).toBe("?a=1&b=2");
  });

  it("expands arrays into repeated keys and skips blank items", () => {
    expect(buildQueryString({ tag: ["x", "", "y"] })).toBe("?tag=x&tag=y");
  });

  it("returns an empty string when nothing remains", () => {
    expect(buildQueryString({ a: "", b: undefined })).toBe("");
  });
});

describe("reportFiltersSchema", () => {
  it("is exported for callers that compose it (e.g. admin surfaces)", () => {
    expect(reportFiltersSchema.parse({}).sort).toBe("recent");
  });
});
