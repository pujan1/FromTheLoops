// index-typesense — the SEARCH consumer of the events outbox (Sprint 3 Day 6).
// Twin of refresh-aggregate.ts: same two job kinds, same idempotent core, but
// the write target is Typesense instead of the aggregate table.
//
//   1. FAST PATH — a Postgres NOTIFY (trigger from migration 0010) wakes the
//      listener (listen.ts), which enqueues a per-event "event" job here.
//   2. FALLBACK — a repeatable "sweep" claims any events the search consumer
//      hasn't drained (NOTIFY can drop) and indexes them inline.
//
// indexReportForEvent (search pkg) is idempotent — missing/already-drained
// event → no-op, upsert is create-or-replace, delete tolerates already-gone —
// so the two paths racing, or a BullMQ retry after a mid-job crash, are safe.

import { getDb } from "@fromtheloop/db";
import { getSearchClient, indexReportForEvent } from "@fromtheloop/search";
import type { Job } from "bullmq";
import {
  claimUnprocessedSearchEvents,
} from "@fromtheloop/db";

export const INDEX_TYPESENSE_QUEUE = "index-typesense";

// Job names within the queue.
export const INDEX_EVENT_JOB = "event"; // data: { eventId }
export const INDEX_SWEEP_JOB = "sweep"; // repeatable fallback, no data

export const INDEX_SWEEP_SCHEDULER = "index-typesense-sweep";
export const INDEX_SWEEP_EVERY_MS = 30_000;

// jobId dedupes NOTIFY re-deliveries; attempts+backoff retry a transient
// Typesense blip without losing the index write.
export function indexEventJobId(eventId: string): string {
  return `idx:${eventId}`;
}

export const INDEX_EVENT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

interface IndexEventData {
  eventId: string;
}

export async function processIndexTypesense(job: Job): Promise<void> {
  if (job.name === INDEX_SWEEP_JOB) {
    await runSweep(job);
    return;
  }
  const { eventId } = job.data as IndexEventData;
  const result = await indexReportForEvent(getDb(), getSearchClient(), eventId);
  console.log(`[index-typesense] job ${job.id} event=${eventId} -> ${result}`);
}

// Drain every event the search consumer still owes, oldest first. Capped per
// pass; the next tick picks up any remainder.
async function runSweep(job: Job): Promise<void> {
  const db = getDb();
  const client = getSearchClient();
  const pending = await claimUnprocessedSearchEvents(db, 500);
  for (const event of pending) {
    await indexReportForEvent(db, client, event.id);
  }
  if (pending.length > 0) {
    console.log(
      `[index-typesense] sweep ${job.id} drained ${pending.length} event(s)`,
    );
  }
}
