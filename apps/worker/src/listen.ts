// Postgres LISTEN bridge — the fast path of the events outbox (Sprint 3).
//
// Holds ONE dedicated Postgres connection LISTENing on the 'events' channel
// (the report-write trigger from migration 0010 NOTIFYs it on commit, payload =
// event id). Each notification fans out to EVERY registered consumer queue —
// today the aggregate refresh and the Typesense indexer — enqueuing one
// per-event job each. This is best-effort latency only; durability lives in the
// events table + each consumer's fallback sweep, so a failed enqueue is logged,
// not fatal.
//
// We use a raw postgres.js client here (not getDb()'s pooled drizzle handle):
// LISTEN must own its connection for the process lifetime, which a pool can't
// guarantee. postgres.js auto-reconnects and re-LISTENs on a dropped link.

import { EVENTS_CHANNEL } from "@fromtheloop/db";
import type { Queue } from "bullmq";
import postgres from "postgres";

// One consumer's enqueue recipe: which queue, the job name, how to derive the
// dedupe jobId from the event id, and the job options (attempts/backoff).
export interface EventConsumer {
  queue: Queue;
  jobName: string;
  jobId: (eventId: string) => string;
  jobOpts: Record<string, unknown>;
  // For log lines only.
  label: string;
}

export interface EventListener {
  close: () => Promise<void>;
}

export async function startEventListener(
  consumers: EventConsumer[],
): Promise<EventListener> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

  await sql.listen(EVENTS_CHANNEL, (payload) => {
    const eventId = payload;
    for (const c of consumers) {
      void c.queue
        .add(c.jobName, { eventId }, { jobId: c.jobId(eventId), ...c.jobOpts })
        .catch((err) =>
          console.error(
            `[event-listener] ${c.label} enqueue failed for ${eventId}:`,
            err,
          ),
        );
    }
  });

  console.log(
    `[event-listener] LISTEN ${EVENTS_CHANNEL} → ${consumers
      .map((c) => c.label)
      .join(", ")}`,
  );
  return { close: () => sql.end({ timeout: 5 }) };
}
