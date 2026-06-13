// ADR-0010 instrumentation seam. The browse surfaces are a triage UX we're
// deciding on intuition — device split and triage-vs-consume-all are unmeasured.
// These events are the only path to that data.
//
// Sink: a fire-and-forget POST to /api/events, which persists to the
// analytics_events table in Neon (self-hosted; no third-party analytics). We use
// navigator.sendBeacon so an event queued as the page unloads (the peek_dwell
// fired on close / hard-nav) still reaches the server — a plain fetch would be
// cancelled mid-flight. Telemetry is best-effort: a failed send is swallowed and
// never blocks or surfaces to the user.

// The closed event vocabulary. A runtime const (not just a type) so the
// /api/events route can validate incoming names against the SAME set — anything
// else is dropped, keeping the public write endpoint honest.
export const TRACK_EVENTS = [
  // A report opened in the triage pane / sheet (vs a hard nav to /reports/:id).
  "peek_open",
  // Prev/next stepping within the pane/sheet — the cheap-scan signal.
  "peek_step",
  // "Open full report" — the commit, the pane → canonical-page handoff.
  "open_full",
  // Time spent on a single peeked report before moving on (ms), on close/step.
  "peek_dwell",
] as const;

export type TrackEvent = (typeof TRACK_EVENTS)[number];

export type TrackProps = Record<string, string | number | boolean | undefined>;

export function track(event: TrackEvent, props: TrackProps = {}): void {
  sink(event, props);
}

// The one sink. Everything below is the transport; call sites never change.
function sink(event: TrackEvent, props: TrackProps): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[track]", event, props);
  }
  // Only meaningful client-side; track() is never called during SSR, but guard
  // so importing this module on the server is inert.
  if (typeof navigator === "undefined") return;

  // Stamp the originating path so the device split AND the per-surface breakdown
  // (role vs company feed vs profile — ADR-0010 "pane on other surfaces") both
  // fall out of one query, without each call site repeating it.
  const body = JSON.stringify({
    name: event,
    props: { ...props, path: window.location.pathname },
  });
  const blob = new Blob([body], { type: "application/json" });

  // sendBeacon is the unload-safe path; fall back to keepalive fetch if it's
  // unavailable or the browser refuses the beacon (queue full).
  if (navigator.sendBeacon?.("/api/events", blob)) return;
  void fetch("/api/events", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}
