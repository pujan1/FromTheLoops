import {
  type AnalyticsEventInput,
  getDb,
  insertAnalyticsEvents,
} from "@fromtheloop/db";
import { TRACK_EVENTS } from "@/lib/track";

// ADR-0010 instrumentation sink. Receives the client track() stream (one event
// per sendBeacon, or a {events:[…]} batch) and persists it to analytics_events.
//
// This is an UNAUTHENTICATED public write, so it's defensive: it accepts only
// names from the closed TRACK_EVENTS vocabulary (junk is dropped, not stored),
// caps the batch size and per-event props payload, and always answers 204 —
// telemetry must never block a navigation or leak a DB error to the page. A
// sendBeacon caller ignores the body anyway.
//
// Node runtime: postgres.js needs Node, not edge (same as the other db routes).
export const runtime = "nodejs";

const ALLOWED = new Set<string>(TRACK_EVENTS);
// One sendBeacon carries a single event; the batch shape is a courtesy. Cap it
// so a crafted request can't fan one POST into an unbounded insert.
const MAX_BATCH = 20;
// Props come from our own client (a handful of small scalars). Anything bigger is
// abuse; keep the event name, drop the oversized payload rather than store it.
const MAX_PROPS_BYTES = 2_000;

export async function POST(req: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return noContent(); // unparseable body → nothing to record
  }

  const raw = Array.isArray((payload as { events?: unknown })?.events)
    ? (payload as { events: unknown[] }).events
    : [payload];

  const events: AnalyticsEventInput[] = [];
  for (const item of raw.slice(0, MAX_BATCH)) {
    if (!item || typeof item !== "object") continue;
    const { name, props } = item as { name?: unknown; props?: unknown };
    if (typeof name !== "string" || !ALLOWED.has(name)) continue;
    events.push({ name, props: sanitizeProps(props) });
  }

  if (events.length > 0) {
    try {
      await insertAnalyticsEvents(getDb(), events);
    } catch {
      // Best-effort telemetry: a write failure is never the client's problem.
    }
  }
  return noContent();
}

// A plain JSON object within the size cap, else {} (the event still counts).
function sanitizeProps(props: unknown): Record<string, unknown> {
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  if (JSON.stringify(props).length > MAX_PROPS_BYTES) return {};
  return props as Record<string, unknown>;
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}
