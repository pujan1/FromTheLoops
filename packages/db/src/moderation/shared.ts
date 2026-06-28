import { modActionLogs } from "../schema/index.js";
import type { Db, Executor } from "../lib/types.js";
import type { LogModActionInput } from "./types.js";

export type { Db, Executor };

// Commands return true iff a pending row was actually transitioned (idempotent
// via the status guard in the WHERE).
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
