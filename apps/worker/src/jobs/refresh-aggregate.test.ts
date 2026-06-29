// refresh-aggregate is the aggregate consumer's worker: route a per-event job to
// one refresh, or drain the outbox on a sweep. refreshAggregateForEvent (the
// actual recompute) is tested in @fromtheloop/db; here we assert routing + drain.

import type { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fromtheloop/db", () => ({
  getDb: vi.fn(() => ({})),
  claimUnprocessedAggregateEvents: vi.fn(),
  refreshAggregateForEvent: vi.fn(),
}));

import {
  claimUnprocessedAggregateEvents,
  refreshAggregateForEvent,
} from "@fromtheloop/db";
import {
  REFRESH_EVENT_JOB,
  REFRESH_SWEEP_JOB,
  processRefreshAggregate,
} from "./refresh-aggregate.js";

const claim = vi.mocked(claimUnprocessedAggregateEvents);
const refresh = vi.mocked(refreshAggregateForEvent);

beforeEach(() => {
  refresh.mockResolvedValue("refreshed" as never);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("processRefreshAggregate", () => {
  it("refreshes the single event for a per-event job", async () => {
    const job = { id: "j1", name: REFRESH_EVENT_JOB, data: { eventId: "evt-1" } } as unknown as Job;
    await processRefreshAggregate(job);
    expect(refresh).toHaveBeenCalledWith(expect.anything(), "evt-1");
    expect(claim).not.toHaveBeenCalled();
  });

  it("drains claimed events oldest-first on a sweep", async () => {
    claim.mockResolvedValue([{ id: "evt-1" }, { id: "evt-2" }] as never);
    const job = { id: "sweep-1", name: REFRESH_SWEEP_JOB, data: {} } as unknown as Job;
    await processRefreshAggregate(job);
    expect(refresh.mock.calls.map((c) => c[1])).toEqual(["evt-1", "evt-2"]);
  });
});
