// Append-only analytics writes (the /api/events route is the only producer).

import { analyticsEvents } from "../schema/analytics.js";
import type { Db } from "../lib/types.js";

export interface AnalyticsEventInput {
  name: string;
  props?: Record<string, unknown>;
}

// No-op on an empty batch.
export async function insertAnalyticsEvents(
  db: Db,
  inputs: AnalyticsEventInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  await db
    .insert(analyticsEvents)
    .values(inputs.map((e) => ({ name: e.name, props: e.props ?? {} })));
}
