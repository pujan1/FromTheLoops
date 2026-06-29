// searchReports — the only place a Typesense search is shaped. We assert the
// exact search params it sends (filter_by string, match-all handling, sort) and
// how it maps the raw hit back to a ReportSearchHit. A fake client captures the
// params and returns a canned response; no Typesense server.

import type { Client } from "typesense";
import { describe, expect, it, vi } from "vitest";
import { searchReports, type ReportSearchParams } from "./reports.js";

type SearchArgs = Record<string, unknown>;

// Fake client whose .search() records its args and returns `response`.
function makeFakeClient(response: unknown): {
  client: Client;
  lastSearchArgs: () => SearchArgs;
} {
  const search = vi.fn().mockResolvedValue(response);
  const documents = vi.fn(() => ({ search }));
  const collections = vi.fn(() => ({ documents }));
  return {
    client: { collections } as unknown as Client,
    lastSearchArgs: () => search.mock.calls.at(-1)?.[0] as SearchArgs,
  };
}

const EMPTY_RESPONSE = { hits: [], found: 0, search_time_ms: 1 };

function run(
  params: Partial<ReportSearchParams>,
  response: unknown = EMPTY_RESPONSE,
): Promise<{ args: SearchArgs; result: Awaited<ReturnType<typeof searchReports>> }> {
  const { client, lastSearchArgs } = makeFakeClient(response);
  const full: ReportSearchParams = { q: "", page: 1, perPage: 20, ...params };
  return searchReports(full, client).then((result) => ({
    args: lastSearchArgs(),
    result,
  }));
}

describe("searchReports — query shape", () => {
  // Blank query is the default landing/browse state: match everything, ordered
  // by recency. A relevance sort here would be meaningless (no query term).
  it("turns a blank query into match-all sorted newest-first", async () => {
    const { args } = await run({ q: "   " });
    expect(args.q).toBe("*");
    expect(args.sort_by).toBe("created_at:desc");
  });

  // A real query ranks by relevance — passing sort_by would override that.
  it("passes the query through and drops the recency sort", async () => {
    const { args } = await run({ q: "binary search" });
    expect(args.q).toBe("binary search");
    expect(args.sort_by).toBeUndefined();
    expect(args.query_by).toBe("text,company_name,role_name,topic_names");
  });

  it("forwards pagination", async () => {
    const { args } = await run({ q: "x", page: 3, perPage: 50 });
    expect(args.page).toBe(3);
    expect(args.per_page).toBe(50);
  });
});

describe("searchReports — filter_by builder", () => {
  it("omits filter_by entirely when no filters are set", async () => {
    const { args } = await run({ q: "x" });
    expect(args.filter_by).toBeUndefined();
  });

  it("builds a single-facet clause", async () => {
    const { args } = await run({ q: "x", filters: { outcome: "offer" } });
    expect(args.filter_by).toBe("outcome:=`offer`");
  });

  it("wraps an array facet (round type) in brackets", async () => {
    const { args } = await run({ q: "x", filters: { roundType: "onsite" } });
    expect(args.filter_by).toBe("round_types:=[`onsite`]");
  });

  // Multiple topics is an OR within the one bracketed clause (match ANY).
  it("joins multiple topics as an OR list", async () => {
    const { args } = await run({ q: "x", filters: { topics: ["graphs", "dp"] } });
    expect(args.filter_by).toBe("topic_slugs:=[`graphs`,`dp`]");
  });

  it("maps verifiedOnly onto the evidence_verified facet", async () => {
    const { args } = await run({ q: "x", filters: { verifiedOnly: true } });
    expect(args.filter_by).toBe("evidence_verified:=true");
  });

  // Distinct facets are AND-ed together. Order follows the builder so a drift in
  // clause order (which would still be correct but harder to diff) is caught.
  it("joins distinct facets with &&", async () => {
    const { args } = await run({
      q: "x",
      filters: { outcome: "offer", roundType: "onsite", verifiedOnly: true },
    });
    expect(args.filter_by).toBe(
      "outcome:=`offer` && round_types:=[`onsite`] && evidence_verified:=true",
    );
  });

  // Backticks in a value would break out of the literal; the builder strips
  // them. Guards against a slug/month with a stray backtick injecting filter
  // syntax.
  it("strips backticks from a filter value", async () => {
    const { args } = await run({ q: "x", filters: { outcome: "of`fer" } });
    expect(args.filter_by).toBe("outcome:=`offer`");
  });

  it("ignores an empty topics array", async () => {
    const { args } = await run({ q: "x", filters: { topics: [] } });
    expect(args.filter_by).toBeUndefined();
  });
});

describe("searchReports — hit mapping", () => {
  const hitDoc = {
    id: "rep-1",
    company_slug: "acme",
    company_name: "Acme",
    role_slug: "sde-2",
    role_name: "SDE II",
    level: "L4",
    outcome: "offer",
    round_types: ["phone", "onsite"],
    round_count: 2,
    topic_slugs: ["graphs"],
    topic_names: ["Graphs"],
    evidence_verified: true,
    interview_month: "2026-03",
  };

  it("maps a doc + highlight onto a ReportSearchHit", async () => {
    const { result } = await run(
      { q: "graph" },
      {
        hits: [{ document: hitDoc, highlight: { text: { snippet: "a <mark>graph</mark> q" } } }],
        found: 1,
        search_time_ms: 4,
      },
    );
    expect(result.found).toBe(1);
    expect(result.hits[0]).toEqual({
      id: "rep-1",
      companySlug: "acme",
      companyName: "Acme",
      roleSlug: "sde-2",
      roleName: "SDE II",
      level: "L4",
      outcome: "offer",
      roundTypes: ["phone", "onsite"],
      roundCount: 2,
      topicSlugs: ["graphs"],
      topicNames: ["Graphs"],
      verified: true,
      interviewMonth: "2026-03",
      snippet: "a <mark>graph</mark> q",
    });
  });

  // Match-all has no query term, so there's nothing to highlight.
  it("nulls the snippet for a match-all search", async () => {
    const { result } = await run(
      { q: "" },
      { hits: [{ document: hitDoc }], found: 1, search_time_ms: 1 },
    );
    expect(result.hits[0]?.snippet).toBeNull();
  });

  it("nulls a missing outcome", async () => {
    const noOutcome = { ...hitDoc };
    delete (noOutcome as Record<string, unknown>).outcome;
    const { result } = await run(
      { q: "x" },
      { hits: [{ document: noOutcome }], found: 1, search_time_ms: 1 },
    );
    expect(result.hits[0]?.outcome).toBeNull();
  });

  // Pre-field docs (indexed before round_count existed) fall back to the length
  // of round_types so the count never renders as undefined.
  it("falls back round_count to round_types length for legacy docs", async () => {
    const legacy = { ...hitDoc };
    delete (legacy as Record<string, unknown>).round_count;
    const { result } = await run(
      { q: "x" },
      { hits: [{ document: legacy }], found: 1, search_time_ms: 1 },
    );
    expect(result.hits[0]?.roundCount).toBe(2); // = round_types.length
  });
});
