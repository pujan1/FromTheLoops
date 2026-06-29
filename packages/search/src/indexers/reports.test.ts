// buildReportDoc shape + the upsert/import/delete control flow. No Typesense
// server: a hand-rolled fake Client records the calls and lets us drive the
// success/failure/404 branches that the real server would otherwise produce.

import type { Client } from "typesense";
import type { ReportIndexInput } from "@fromtheloop/db";
import { describe, expect, it, vi } from "vitest";
import {
  buildReportDoc,
  deleteReportDoc,
  importReportDocs,
  upsertReportDoc,
} from "./reports.js";

// A complete, "verified" report. Cases below clone + tweak the one field
// under test so the rest of the shape stays realistic.
function makeInput(overrides: Partial<ReportIndexInput> = {}): ReportIndexInput {
  return {
    id: "rep-1",
    company: { id: "c-1", slug: "acme", name: "Acme" },
    role: { id: "r-1", slug: "sde-2", name: "SDE II" },
    level: "L4",
    outcome: "offer",
    evidenceVerified: true,
    interviewMonth: "2026-03",
    createdAt: new Date("2026-03-15T12:00:00.000Z"),
    roundTypes: ["phone", "onsite"],
    roundCount: 2,
    topics: [
      { id: "t-1", slug: "graphs", name: "Graphs" },
      { id: "t-2", slug: "dp", name: "Dynamic Programming" },
    ],
    text: "BFS on a grid, then a DP follow-up.",
    ...overrides,
  };
}

describe("buildReportDoc", () => {
  it("denormalizes the nested company/role/topics onto flat doc fields", () => {
    const doc = buildReportDoc(makeInput());
    expect(doc).toMatchObject({
      id: "rep-1",
      company_id: "c-1",
      company_slug: "acme",
      company_name: "Acme",
      role_id: "r-1",
      role_slug: "sde-2",
      role_name: "SDE II",
      level: "L4",
      round_types: ["phone", "onsite"],
      round_count: 2,
      topic_ids: ["t-1", "t-2"],
      topic_slugs: ["graphs", "dp"],
      topic_names: ["Graphs", "Dynamic Programming"],
    });
  });

  // trust_tier is the facet the "verified only" filter reads; it must track
  // evidenceVerified or the filter silently includes/excludes the wrong docs.
  it("maps evidenceVerified onto both evidence_verified and trust_tier", () => {
    expect(buildReportDoc(makeInput({ evidenceVerified: true }))).toMatchObject({
      evidence_verified: true,
      trust_tier: "verified",
    });
    expect(buildReportDoc(makeInput({ evidenceVerified: false }))).toMatchObject(
      { evidence_verified: false, trust_tier: "unverified" },
    );
  });

  // outcome is optional in the schema; a null outcome must be *absent*, not
  // null/"" — Typesense would reject a null on an optional string otherwise.
  it("omits outcome entirely when null", () => {
    const doc = buildReportDoc(makeInput({ outcome: null }));
    expect("outcome" in doc).toBe(false);
  });

  it("keeps outcome when present", () => {
    expect(buildReportDoc(makeInput({ outcome: "rejected" })).outcome).toBe(
      "rejected",
    );
  });

  // created_at is the default_sorting_field (int64 unix seconds); a stray ms
  // value would sort/range wrong by a factor of 1000.
  it("stores created_at as floored unix seconds", () => {
    const doc = buildReportDoc(
      makeInput({ createdAt: new Date("2026-03-15T12:00:00.999Z") }),
    );
    expect(doc.created_at).toBe(
      Math.floor(new Date("2026-03-15T12:00:00.999Z").getTime() / 1000),
    );
  });
});

// --- import / upsert / delete: assert the calls + the failure handling ---

interface FakeDocs {
  upsert: ReturnType<typeof vi.fn>;
  import: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

// Builds a fake `client.collections(name).documents([id])` chain. `documents`
// is both callable (collection-level: upsert/import) and indexable by id
// (document-level: delete), matching the typesense client surface we use.
function makeFakeClient(docs: FakeDocs): {
  client: Client;
  collections: ReturnType<typeof vi.fn>;
} {
  const documents = vi.fn(() => ({
    upsert: docs.upsert,
    import: docs.import,
    delete: docs.delete,
  })) as unknown as (id?: string) => FakeDocs;
  const collections = vi.fn(() => ({ documents }));
  const client = { collections } as unknown as Client;
  return { client, collections };
}

describe("upsertReportDoc", () => {
  it("upserts the doc by id (idempotent)", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const { client } = makeFakeClient({
      upsert,
      import: vi.fn(),
      delete: vi.fn(),
    });
    const doc = buildReportDoc(makeInput());
    await upsertReportDoc(client, doc);
    expect(upsert).toHaveBeenCalledWith(doc);
  });
});

describe("importReportDocs", () => {
  it("short-circuits to 0 on an empty batch (no client call)", async () => {
    const importFn = vi.fn();
    const { client } = makeFakeClient({
      upsert: vi.fn(),
      import: importFn,
      delete: vi.fn(),
    });
    expect(await importReportDocs(client, [])).toBe(0);
    expect(importFn).not.toHaveBeenCalled();
  });

  it("returns the doc count when every row succeeds", async () => {
    const importFn = vi.fn().mockResolvedValue([{ success: true }, { success: true }]);
    const { client } = makeFakeClient({
      upsert: vi.fn(),
      import: importFn,
      delete: vi.fn(),
    });
    const docs = [buildReportDoc(makeInput()), buildReportDoc(makeInput({ id: "rep-2" }))];
    expect(await importReportDocs(client, docs)).toBe(2);
    expect(importFn).toHaveBeenCalledWith(docs, { action: "upsert" });
  });

  // A partial import failure must throw — the backfill caller treats a silent
  // drop as success otherwise, and the index quietly loses rows.
  it("throws when any row fails, surfacing the first error", async () => {
    const importFn = vi.fn().mockResolvedValue([
      { success: true },
      { success: false, error: "rank too high" },
    ]);
    const { client } = makeFakeClient({
      upsert: vi.fn(),
      import: importFn,
      delete: vi.fn(),
    });
    await expect(
      importReportDocs(client, [buildReportDoc(makeInput()), buildReportDoc(makeInput())]),
    ).rejects.toThrow(/1\/2 doc\(s\) failed.*rank too high/);
  });
});

describe("deleteReportDoc", () => {
  it("deletes by id", async () => {
    const del = vi.fn().mockResolvedValue({});
    const { client, collections } = makeFakeClient({
      upsert: vi.fn(),
      import: vi.fn(),
      delete: del,
    });
    await deleteReportDoc(client, "rep-1");
    expect(collections).toHaveBeenCalledWith("reports");
    expect(del).toHaveBeenCalled();
  });

  // 404 = the doc is already gone (deleted twice, or never visible). Indexing
  // is idempotent, so this must be swallowed, not retried-to-death.
  it("swallows a 404 (already gone)", async () => {
    const del = vi.fn().mockRejectedValue({ httpStatus: 404 });
    const { client } = makeFakeClient({
      upsert: vi.fn(),
      import: vi.fn(),
      delete: del,
    });
    await expect(deleteReportDoc(client, "rep-1")).resolves.toBeUndefined();
  });

  // Any non-404 (e.g. 503 Typesense down) must propagate so BullMQ retries.
  it("rethrows a non-404 error", async () => {
    const del = vi.fn().mockRejectedValue({ httpStatus: 503 });
    const { client } = makeFakeClient({
      upsert: vi.fn(),
      import: vi.fn(),
      delete: del,
    });
    await expect(deleteReportDoc(client, "rep-1")).rejects.toMatchObject({
      httpStatus: 503,
    });
  });
});
