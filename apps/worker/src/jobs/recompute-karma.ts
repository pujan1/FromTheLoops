// recompute-karma — the KARMA consumer of the events outbox (Sprint 5 Day 7).
// Third sibling of refresh-aggregate.ts / index-typesense.ts, but with one
// twist: karma is per-USER while the event log is per-REPORT, and a single user
// action can emit a burst of events (account delete soft-deletes N reports →
// N 'deleted' events). So this consumer is two-stage and DEBOUNCED per user:
//
//   stage 1 "event"  — resolve event → report → author, enqueue a debounced
//                      "recompute" for that user, then mark the event drained.
//                      Fed by the NOTIFY fast path (listen.ts) + the fallback
//                      "sweep". jobId dedupes NOTIFY re-deliveries.
//   stage 2 "recompute" — the actual recomputeUserKarma(user). Enqueued with
//                      BullMQ deduplication keyed on the userId, so a burst of
//                      events for one user collapses to a single rebuild within
//                      the debounce window.
//   "sweep"          — repeatable fallback: claim any karma events a dropped
//                      NOTIFY missed and run stage 1 inline for each.
//
// recomputeUserKarma is recompute-from-scratch (idempotent), so the two paths
// racing, a debounce collapse, or a BullMQ retry after a crash all converge on
// the same value — the same safety the other two consumers rely on.

import {
  claimUnprocessedKarmaEvents,
  getDb,
  getEventById,
  getReportAuthorId,
  markKarmaEventProcessed,
  recomputeUserKarma,
} from "@fromtheloop/db";
import type { Job, Queue } from "bullmq";

export const RECOMPUTE_KARMA_QUEUE = "recompute-karma";

// Job names within the queue.
export const KARMA_EVENT_JOB = "event"; // data: { eventId }
export const KARMA_RECOMPUTE_JOB = "recompute"; // data: { userId }, deduped
export const KARMA_SWEEP_JOB = "sweep"; // repeatable fallback, no data

export const KARMA_SWEEP_SCHEDULER = "recompute-karma-sweep";
export const KARMA_SWEEP_EVERY_MS = 30_000;

// The debounce window. A burst of events for one user inside this window
// collapses to one recompute (BullMQ deduplication). Short enough that the
// exit-criterion "tier upgrade reflects within 60s" holds with wide margin.
export const KARMA_DEBOUNCE_MS = 2_000;

// jobId dedupes NOTIFY re-deliveries of the same event (stage 1).
export function karmaEventJobId(eventId: string): string {
  return `karma-evt:${eventId}`;
}

export const KARMA_EVENT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

// Stage-2 enqueue opts: deduplication keyed by userId is what makes the
// recompute debounced-per-user. attempts+backoff retry a transient DB blip.
function recomputeJobOpts(userId: string) {
  return {
    deduplication: { id: `karma-user:${userId}`, ttl: KARMA_DEBOUNCE_MS },
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  };
}

interface KarmaEventData {
  eventId: string;
}
interface KarmaRecomputeData {
  userId: string;
}

// Stage 1 for one event: resolve its report's author, enqueue a debounced
// recompute, and mark the event drained. Marking last means a crash before the
// mark leaves the event for the sweep to retry (at-least-once); the recompute
// being idempotent makes the redo harmless. An event whose report/author can't
// be resolved (hard-deleted) is still marked drained — there's nothing to
// recompute and leaving it unmarked would wedge the sweep forever.
async function handleEvent(queue: Queue, eventId: string): Promise<string> {
  const db = getDb();
  const event = await getEventById(db, eventId);
  if (!event) return "unknown-event";

  const userId = await getReportAuthorId(db, event.reportId);
  if (userId) {
    await queue.add(
      KARMA_RECOMPUTE_JOB,
      { userId } satisfies KarmaRecomputeData,
      recomputeJobOpts(userId),
    );
  }
  await markKarmaEventProcessed(db, eventId);
  return userId ? `enqueued ${userId}` : "no-author";
}

// The processor needs its own Queue handle to enqueue stage-2 jobs, so it's
// built via a factory that closes over the queue (created in index.ts).
export function makeProcessRecomputeKarma(
  queue: Queue,
): (job: Job) => Promise<void> {
  return async function processRecomputeKarma(job: Job): Promise<void> {
    if (job.name === KARMA_SWEEP_JOB) {
      await runSweep(queue, job);
      return;
    }
    if (job.name === KARMA_RECOMPUTE_JOB) {
      const { userId } = job.data as KarmaRecomputeData;
      const result = await recomputeUserKarma(getDb(), userId);
      console.log(
        `[recompute-karma] job ${job.id} user=${userId} -> ${result.karma}` +
          (result.changed ? ` (was ${result.previous})` : " (unchanged)"),
      );
      return;
    }
    // KARMA_EVENT_JOB
    const { eventId } = job.data as KarmaEventData;
    const result = await handleEvent(queue, eventId);
    console.log(`[recompute-karma] job ${job.id} event=${eventId} -> ${result}`);
  };
}

// Drain every karma event a dropped NOTIFY missed, oldest first. Runs stage 1
// inline for each (resolve author → debounced recompute → mark). Capped per
// pass; the next tick picks up any remainder.
async function runSweep(queue: Queue, job: Job): Promise<void> {
  const db = getDb();
  const pending = await claimUnprocessedKarmaEvents(db, 500);
  for (const event of pending) {
    await handleEvent(queue, event.id);
  }
  if (pending.length > 0) {
    console.log(
      `[recompute-karma] sweep ${job.id} drained ${pending.length} event(s)`,
    );
  }
}
