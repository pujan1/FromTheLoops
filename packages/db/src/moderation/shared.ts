// Shared internals for the moderation modules (Sprint 6 Day 3/4): the
// db/transaction executor types, the common command-input shape, and
// logModAction — the append-only audit write every command funnels through.
// Split out of moderation.ts so each queue's data access lives in its own
// focused file while still sharing one audit-write path.

import { modActionLogs } from "../schema/index.js";
import type { Db, Executor } from "../lib/types.js";
import type { LogModActionInput } from "./types.js";

// Re-export so the queue modules keep importing the db handle from ./shared.js
// alongside Command + logModAction.
export type { Db, Executor };

// The input every approve/reject/restore command takes. Commands return true iff
// a pending row was actually transitioned — so the queue UI drops exactly the
// rows that changed, and a double-submit is a logged no-op returning false (the
// status guard in the WHERE makes it idempotent).
export type Command = { id: string; modUserId: string; reason?: string };

export async function logModAction(db: Executor, input: LogModActionInput): Promise<void> {
  await db.insert(modActionLogs).values({
    modUserId: input.modUserId,
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  });
}
