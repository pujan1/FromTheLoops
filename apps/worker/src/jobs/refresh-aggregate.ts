// refresh-aggregate — the aggregate consumer of the events outbox (Sprint 3
// Day 4). Two ways an event reaches a refresh, both funnelling through the
// idempotent refreshAggregateForEvent (db):
//
//   1. FAST PATH — a Postgres NOTIFY (trigger from migration 0010) wakes the
//      listener (listen.ts), which enqueues a per-event "event" job here.
//   2. FALLBACK — a repeatable "sweep" job claims any events the aggregate
//      consumer hasn't drained (a NOTIFY can be dropped if the listener was
//      down) and refreshes them inline.
//
// refreshAggregateForEvent is idempotent (no-ops on a missing/already-drained
// event, and the cell recompute is itself idempotent), so the two paths racing
// on the same event — or a BullMQ retry after a mid-job crash — is always safe.

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

// Fallback sweep cadence. NOTIFY delivers in milliseconds; this only has to
// catch the rare dropped notification, so a loose interval is plenty.
export const REFRESH_SWEEP_SCHEDULER = "refresh-aggregate-sweep";
export const REFRESH_SWEEP_EVERY_MS = 30_000;

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
