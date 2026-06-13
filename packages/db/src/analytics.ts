// Analytics-event persistence (ADR-0010 instrumentation). The web app's
// /api/events route handler is the only producer; it forwards the client
// track() stream here. Append-only writes, no reads from app code — you query
// analytics_events directly with SQL. Pure persistence, no shared/core dep.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { analyticsEvents } from "./schema/analytics.js";
import * as schema from "./schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;

export interface AnalyticsEventInput {
  name: string;
  props?: Record<string, unknown>;
}

// Insert a batch of analytics events in one round-trip. A no-op on an empty
// batch (so callers never need to guard). Telemetry, not domain state: the route
// fires this best-effort and never lets a failure here block the response.
export async function insertAnalyticsEvents(
  db: Db,
  inputs: AnalyticsEventInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  await db
    .insert(analyticsEvents)
    .values(inputs.map((e) => ({ name: e.name, props: e.props ?? {} })));
}
