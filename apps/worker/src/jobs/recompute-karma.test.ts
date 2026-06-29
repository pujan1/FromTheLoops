// recompute-karma is two-stage + debounced: stage 1 ("event") resolves an event
// → report → author and enqueues a stage-2 ("recompute") deduplicated per user,
// so a burst for one user collapses to one rebuild. The recompute itself
// (recomputeUserKarma) is tested in @fromtheloop/db. Here we assert the worker's
// resolve → debounced-enqueue → mark-drained logic and the routing.

import type { Job, Queue } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fromtheloop/db", () => ({
  getDb: vi.fn(() => ({})),
  getEventById: vi.fn(),
  getReportAuthorId: vi.fn(),
  markKarmaEventProcessed: vi.fn(),
  recomputeUserKarma: vi.fn(),
  claimUnprocessedKarmaEvents: vi.fn(),
}));

import {
  claimUnprocessedKarmaEvents,
  getEventById,
  getReportAuthorId,
  markKarmaEventProcessed,
  recomputeUserKarma,
} from "@fromtheloop/db";
import {
  KARMA_EVENT_JOB,
  KARMA_RECOMPUTE_JOB,
  KARMA_SWEEP_JOB,
  makeProcessRecomputeKarma,
} from "./recompute-karma.js";

const eventById = vi.mocked(getEventById);
const authorId = vi.mocked(getReportAuthorId);
const markProcessed = vi.mocked(markKarmaEventProcessed);
const recompute = vi.mocked(recomputeUserKarma);
const claim = vi.mocked(claimUnprocessedKarmaEvents);

// Fake stage-2 queue; the factory closes over it to enqueue debounced jobs.
function makeQueue(): { queue: Queue; add: ReturnType<typeof vi.fn> } {
  const add = vi.fn().mockResolvedValue({});
  return { queue: { add } as unknown as Queue, add };
}

function eventJob(eventId: string): Job {
  return { id: "j1", name: KARMA_EVENT_JOB, data: { eventId } } as unknown as Job;
}

beforeEach(() => {
  eventById.mockResolvedValue({ id: "evt-1", reportId: "rep-1" } as never);
  authorId.mockResolvedValue("user-1");
  markProcessed.mockResolvedValue(undefined as never);
  recompute.mockResolvedValue({ karma: 12, previous: 10, changed: true } as never);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("stage 1 — event handling", () => {
  // Resolvable event with an author: enqueue a per-user recompute and mark the
  // event drained. The enqueue must carry the dedup key so a burst collapses.
  it("enqueues a per-user debounced recompute and marks the event processed", async () => {
    const { queue, add } = makeQueue();
    await makeProcessRecomputeKarma(queue)(eventJob("evt-1"));

    expect(add).toHaveBeenCalledWith(
      KARMA_RECOMPUTE_JOB,
      { userId: "user-1" },
      expect.objectContaining({
        deduplication: expect.objectContaining({ id: "karma-user:user-1" }),
      }),
    );
    expect(markProcessed).toHaveBeenCalledWith(expect.anything(), "evt-1");
  });

  // An unknown event (NOTIFY re-delivery after the row was already consumed) is a
  // no-op — nothing to enqueue, and crucially it is NOT marked (there is no row).
  it("no-ops on an unknown event without enqueue or mark", async () => {
    eventById.mockResolvedValue(null as never);
    const { queue, add } = makeQueue();
    await makeProcessRecomputeKarma(queue)(eventJob("ghost"));

    expect(add).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
  });

  // Author can't be resolved (hard-deleted) — still mark the event, else it
  // wedges the sweep forever. No recompute to enqueue.
  it("marks the event but skips enqueue when the author is unresolvable", async () => {
    authorId.mockResolvedValue(null);
    const { queue, add } = makeQueue();
    await makeProcessRecomputeKarma(queue)(eventJob("evt-1"));

    expect(add).not.toHaveBeenCalled();
    expect(markProcessed).toHaveBeenCalledWith(expect.anything(), "evt-1");
  });
});

describe("stage 2 — recompute", () => {
  it("recomputes karma for the job's user", async () => {
    const { queue } = makeQueue();
    const job = { id: "j2", name: KARMA_RECOMPUTE_JOB, data: { userId: "user-9" } } as unknown as Job;
    await makeProcessRecomputeKarma(queue)(job);
    expect(recompute).toHaveBeenCalledWith(expect.anything(), "user-9");
  });
});

describe("sweep", () => {
  it("runs stage 1 for every claimed event", async () => {
    claim.mockResolvedValue([{ id: "evt-1" }, { id: "evt-2" }] as never);
    eventById.mockImplementation(
      async (_db: unknown, id: string) => ({ id, reportId: `rep-${id}` }) as never,
    );
    const { queue, add } = makeQueue();
    const job = { id: "sweep-1", name: KARMA_SWEEP_JOB, data: {} } as unknown as Job;
    await makeProcessRecomputeKarma(queue)(job);

    expect(add).toHaveBeenCalledTimes(2);
    expect(markProcessed.mock.calls.map((c) => c[1])).toEqual(["evt-1", "evt-2"]);
  });
});
