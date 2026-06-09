// ADR-0010 instrumentation seam. The browse surfaces are a triage UX we're
// deciding on intuition — device split and triage-vs-consume-all are unmeasured.
// These events are the only path to that data. There is no analytics provider
// wired yet, so the sink below is a dev-only console log / prod no-op; a real
// provider (PostHog, Plausible custom events, an /api/events route, …) drops into
// `sink` later with ZERO changes at the call sites. Keep call sites typed against
// `TrackEvent` so the event vocabulary stays a closed, greppable set.

export type TrackEvent =
  // A report opened in the triage pane (vs a hard nav to /reports/:id).
  | "peek_open"
  // Prev/next stepping within the pane — the cheap-scan signal.
  | "peek_step"
  // "Open full report" — the commit, the pane → canonical-page handoff.
  | "open_full"
  // Time spent on a single peeked report before moving on (ms), on close/step.
  | "peek_dwell";

export type TrackProps = Record<string, string | number | boolean | undefined>;

export function track(event: TrackEvent, props: TrackProps = {}): void {
  sink(event, props);
}

// The one sink. Swap this body for a real provider call; nothing else changes.
function sink(event: TrackEvent, props: TrackProps): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[track]", event, props);
  }
}
