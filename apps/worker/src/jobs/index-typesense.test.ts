// index-typesense routes on job name: a per-event job indexes one report, the
// repeatable sweep drains the events outbox the search consumer still owes. The
// indexing itself (indexReportForEvent) lives in @fromtheloop/search and is
// tested there; here we assert the worker's routing + sweep drain order.

import type { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fromtheloop/db", () => ({
  getDb: vi.fn(() => ({})),
  claimUnprocessedSearchEvents: vi.fn(),
}));
vi.mock("@fromtheloop/search", () => ({
  getSearchClient: vi.fn(() => ({})),
  indexReportForEvent: vi.fn(),
}));

import { claimUnprocessedSearchEvents } from "@fromtheloop/db";
import { indexReportForEvent } from "@fromtheloop/search";
import {
  INDEX_EVENT_JOB,
  INDEX_SWEEP_JOB,
  processIndexTypesense,
} from "./index-typesense.js";

const claim = vi.mocked(claimUnprocessedSearchEvents);
const indexEvent = vi.mocked(indexReportForEvent);

beforeEach(() => {
  indexEvent.mockResolvedValue("indexed");
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("processIndexTypesense", () => {
  it("indexes the single event for a per-event job", async () => {
    const job = { id: "j1", name: INDEX_EVENT_JOB, data: { eventId: "evt-1" } } as unknown as Job;
    await processIndexTypesense(job);
    expect(indexEvent).toHaveBeenCalledWith(expect.anything(), expect.anything(), "evt-1");
    expect(claim).not.toHaveBeenCalled();
  });

  it("drains every claimed event, oldest first, on a sweep", async () => {
    claim.mockResolvedValue([{ id: "evt-1" }, { id: "evt-2" }, { id: "evt-3" }] as never);
    const job = { id: "sweep-1", name: INDEX_SWEEP_JOB, data: {} } as unknown as Job;
    await processIndexTypesense(job);

    expect(indexEvent).toHaveBeenCalledTimes(3);
    expect(indexEvent.mock.calls.map((c) => c[2])).toEqual(["evt-1", "evt-2", "evt-3"]);
  });

  it("does nothing on an empty sweep", async () => {
    claim.mockResolvedValue([] as never);
    const job = { id: "sweep-2", name: INDEX_SWEEP_JOB, data: {} } as unknown as Job;
    await processIndexTypesense(job);
    expect(indexEvent).not.toHaveBeenCalled();
  });
});
