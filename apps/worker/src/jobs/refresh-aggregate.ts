// refresh-aggregate — aggregate consumer of the events outbox. A NOTIFY fast
// path enqueues per-event jobs; a repeatable sweep is the fallback for when the
// listener is off or drops one. refreshAggregateForEvent is idempotent, so the
// paths racing or a retry after a crash is always safe.

import {
  claimUnprocessedAggregateEvents,
  getDb,
  refreshAggregateForEvent,
} from "@fromtheloop/db";
import type { Job } from "bullmq";

export const REFRESH_AGGREGATE_QUEUE = "refresh-aggregate";

// Job names within the queue.
export const REFRESH_EVENT_JOB = "event"; // data: { eventId }
export const REFRESH_SWEEP_JOB = "sweep"; // repeatable fallback, no data

// Fallback sweep cadence. With the LISTEN fast path ON this only catches the
// rare dropped notification, so the interval is loose. With it OFF (Neon free
// tier — the default) the sweep IS the delivery path, and the interval is long
// (30 min default) so the worker leaves Neon idle long enough to scale to zero
// between sweeps — the gap must exceed Neon's ~5-min suspend timer. All three
// consumer sweeps read the same env var so they fire together (one Neon wake
// window, not three). Lower WORKER_SWEEP_EVERY_MS for fresher data once off a
// compute-capped plan.
export const REFRESH_SWEEP_SCHEDULER = "refresh-aggregate-sweep";
export const REFRESH_SWEEP_EVERY_MS = Number(process.env.WORKER_SWEEP_EVERY_MS) || 1_800_000;

// Per-event job options. jobId dedupes NOTIFY re-deliveries of the same event;
// attempts+backoff give BullMQ-level retry so a transient DB error or a mid-job
// worker kill doesn't lose the refresh.
export function eventJobId(eventId: string): string {
  return `evt:${eventId}`;
}

export const REFRESH_EVENT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

interface RefreshEventData {
  eventId: string;
}

export async function processRefreshAggregate(job: Job): Promise<void> {
  if (job.name === REFRESH_SWEEP_JOB) {
    await runSweep(job);
    return;
  }
  const { eventId } = job.data as RefreshEventData;
  const result = await refreshAggregateForEvent(getDb(), eventId);
  console.log(
    `[refresh-aggregate] job ${job.id} event=${eventId} -> ${result}`,
  );
}

// Drain every event the aggregate consumer still owes, oldest first. Capped per
// pass; the next tick picks up any remainder.
async function runSweep(job: Job): Promise<void> {
  const db = getDb();
  const pending = await claimUnprocessedAggregateEvents(db, 500);
  for (const event of pending) {
    await refreshAggregateForEvent(db, event.id);
  }
  if (pending.length > 0) {
    console.log(
      `[refresh-aggregate] sweep ${job.id} drained ${pending.length} event(s)`,
    );
  }
}
