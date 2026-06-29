// reconcile is the daily drift safety-net: three idempotent passes (auto-approve,
// aggregate refresh, Typesense backfill), each isolated so one outage can't block
// the others, with all failures collected and re-thrown so BullMQ retries the
// whole (idempotent) job. That isolation + collection is the contract worth
// testing — the passes themselves are tested in db/search. So we mock those edges
// and drive the failure matrix.

import type { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fromtheloop/db", () => ({
  getDb: vi.fn(() => ({})),
  runAutoApprove: vi.fn(),
  refreshAllAggregates: vi.fn(),
}));
vi.mock("@fromtheloop/search", () => ({
  getSearchClient: vi.fn(() => ({})),
  ensureCollections: vi.fn(),
  backfillAll: vi.fn(),
}));

import { refreshAllAggregates, runAutoApprove } from "@fromtheloop/db";
import { backfillAll, ensureCollections } from "@fromtheloop/search";
import { processReconcile } from "./reconcile.js";

const autoApprove = vi.mocked(runAutoApprove);
const refreshAggregates = vi.mocked(refreshAllAggregates);
const backfill = vi.mocked(backfillAll);
const ensure = vi.mocked(ensureCollections);

const job = { id: "job-1" } as unknown as Job;

// Default every pass to success; individual tests override the one they break.
beforeEach(() => {
  autoApprove.mockResolvedValue({ evaluated: 3, approved: 1, outcomes: [] });
  refreshAggregates.mockResolvedValue(5);
  ensure.mockResolvedValue([]);
  backfill.mockResolvedValue({ reports: 10, companies: 2, topics: 4 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("processReconcile", () => {
  it("runs all three passes and resolves when every pass succeeds", async () => {
    await expect(processReconcile(job)).resolves.toBeUndefined();
    expect(autoApprove).toHaveBeenCalledOnce();
    expect(refreshAggregates).toHaveBeenCalledOnce();
    expect(backfill).toHaveBeenCalledOnce();
  });

  // The core isolation guarantee: a failing pass must not short-circuit the
  // ones after it. If auto-approve threw and stopped the job, a Typesense drift
  // would never get repaired.
  it("still runs later passes when an earlier pass fails", async () => {
    autoApprove.mockRejectedValue(new Error("auto-approve down"));
    await expect(processReconcile(job)).rejects.toBeInstanceOf(AggregateError);
    expect(refreshAggregates).toHaveBeenCalledOnce();
    expect(backfill).toHaveBeenCalledOnce();
  });

  // All failures are collected into one AggregateError so BullMQ retries the
  // whole job (every pass is idempotent, so re-running the ones that succeeded
  // is harmless). The message names which passes failed.
  it("collects every failure into one AggregateError naming the failed passes", async () => {
    const aErr = new Error("auto-approve down");
    const tErr = new Error("typesense down");
    autoApprove.mockRejectedValue(aErr);
    backfill.mockRejectedValue(tErr);

    const caught = await processReconcile(job).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(AggregateError);
    const agg = caught as AggregateError;
    expect(agg.errors).toEqual([aErr, tErr]);
    expect(agg.message).toContain("auto-approve");
    expect(agg.message).toContain("typesense");
    expect(agg.message).not.toContain("aggregates"); // that pass succeeded
  });

  // The Typesense pass must ensure collections exist before backfilling — a
  // Typesense reset between boots would otherwise make backfill import into a
  // missing collection.
  it("ensures collections before the Typesense backfill", async () => {
    const order: string[] = [];
    ensure.mockImplementation(async () => {
      order.push("ensure");
      return [];
    });
    backfill.mockImplementation(async () => {
      order.push("backfill");
      return { reports: 0, companies: 0, topics: 0 };
    });
    await processReconcile(job);
    expect(order).toEqual(["ensure", "backfill"]);
  });
});
