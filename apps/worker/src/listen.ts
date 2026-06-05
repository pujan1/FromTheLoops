// Postgres LISTEN bridge — the fast path of the events outbox (Sprint 3 Day 4).
//
// Holds ONE dedicated Postgres connection LISTENing on the 'events' channel
// (the report-write trigger from migration 0010 NOTIFYs it on commit, payload =
// event id). Each notification enqueues a per-event refresh-aggregate job. This
// is best-effort latency only — durability lives in the events table + the
// fallback sweep — so a failed enqueue is logged, not fatal.
//
// We use a raw postgres.js client here (not getDb()'s pooled drizzle handle):
// LISTEN must own its connection for the process lifetime, which a pool can't
// guarantee. postgres.js auto-reconnects and re-LISTENs on a dropped link.

import { EVENTS_CHANNEL } from "@fromtheloop/db";
import type { Queue } from "bullmq";
import postgres from "postgres";
import {
  eventJobId,
  REFRESH_EVENT_JOB,
  REFRESH_EVENT_JOB_OPTS,
} from "./jobs/refresh-aggregate.js";

export interface EventListener {
  close: () => Promise<void>;
}

export async function startEventListener(
  queue: Queue,
): Promise<EventListener> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

  await sql.listen(EVENTS_CHANNEL, (payload) => {
    const eventId = payload;
    void queue
      .add(REFRESH_EVENT_JOB, { eventId }, { jobId: eventJobId(eventId), ...REFRESH_EVENT_JOB_OPTS })
      .catch((err) =>
        console.error(`[event-listener] enqueue failed for ${eventId}:`, err),
      );
  });

  console.log(`[event-listener] LISTEN ${EVENTS_CHANNEL}`);
  return { close: () => sql.end({ timeout: 5 }) };
}
