// Drift guards on the collection schemas. These are intentionally light — the
// point is to fail loudly when a field the query/indexer depends on is renamed,
// dropped, or loses its facet flag, since those break search silently at runtime
// rather than at the type level.

import { describe, expect, it } from "vitest";
import { ALL_COLLECTIONS } from "./index.js";
import { reportsCollectionSchema } from "./reports.js";

describe("ALL_COLLECTIONS", () => {
  it("provisions exactly the three collections", () => {
    expect(ALL_COLLECTIONS.map((c) => c.name).sort()).toEqual([
      "companies",
      "reports",
      "topics",
    ]);
  });
});

describe("reports collection schema", () => {
  const byName = new Map(reportsCollectionSchema.fields?.map((f) => [f.name, f]));

  it("sorts by created_at (the recency sort for match-all)", () => {
    expect(reportsCollectionSchema.default_sorting_field).toBe("created_at");
  });

  // Every facet the filter_by builder targets must exist and be facetable, or
  // the filter throws at query time. Mirror of buildFilterBy in query/reports.ts.
  it.each(["outcome", "round_types", "topic_slugs", "evidence_verified"])(
    "keeps %s facetable for filter_by",
    (field) => {
      expect(byName.get(field)?.facet).toBe(true);
    },
  );

  it("indexes the full-text fields query_by reads", () => {
    for (const field of ["text", "company_name", "role_name", "topic_names"]) {
      expect(byName.has(field)).toBe(true);
    }
  });
});
