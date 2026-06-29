// recompute-karma — karma consumer of the events outbox. Two-stage + debounced
// because karma is per-USER but events are per-REPORT: stage 1 ("event")
// resolves event → report → author and enqueues a stage-2 "recompute"
// deduplicated per user, so a burst for one user (e.g. an account delete
// soft-deleting N reports) collapses to one rebuild. NOTIFY fast path + sweep
// fallback. recomputeUserKarma is recompute-from-scratch (idempotent), so racing
// paths, debounce collapse, and retries all converge.

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
// See refresh-aggregate.ts for the cadence rationale (Neon scale-to-zero). Same
// env var across all three sweeps so they wake Neon in one window.
export const KARMA_SWEEP_EVERY_MS = Number(process.env.WORKER_SWEEP_EVERY_MS) || 1_800_000;

// Debounce window: a burst for one user inside it collapses to one recompute.
// Short enough that "tier upgrade reflects within 60s" holds with margin.
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

// Stage 1 for one event: resolve author → enqueue debounced recompute → mark
// drained. Marking last gives at-least-once (a crash leaves it for the sweep;
// the recompute is idempotent). An unresolvable event (hard-deleted author) is
// still marked, else it wedges the sweep forever.
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
