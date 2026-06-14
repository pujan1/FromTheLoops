"use server";

// Server actions behind every moderation queue (Sprint 6 Day 3). One generic
// entry point — runQueueAction — that <ModQueue> calls with {queueId, actionId,
// itemIds, reason}. It re-asserts the moderator gate (never trust the client),
// resolves the acting mod's internal users.id for the audit log, dispatches each
// id to the right command, and revalidates the queue.
//
// Each command (in @fromtheloop/db) writes its mod_action_logs row inside the
// same transaction as the mutation, so an action is logged-and-applied or not at
// all.

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  approvePendingCompany,
  approvePendingRole,
  approvePendingTopic,
  getDb,
  getOrCreateUserByClerkId,
  rejectPendingCompany,
  rejectPendingRole,
  rejectPendingTopic,
} from "@fromtheloop/db";
import { requireModerator } from "@/lib/admin";
import { isQueueId, type QueueActionFn, type QueueId } from "../queue-config";

type CommandFn = (
  db: ReturnType<typeof getDb>,
  cmd: { id: string; modUserId: string; reason?: string },
) => Promise<boolean>;

// (queueId → actionId → command). Only the 3 taxonomy queues are wired in Day 3;
// the rest land in later sprint days. An unmapped action is rejected loudly.
const DISPATCH: Partial<Record<QueueId, Record<string, CommandFn>>> = {
  companies: { approve: approvePendingCompany, reject: rejectPendingCompany },
  tags: { approve: approvePendingTopic, reject: rejectPendingTopic },
  roles: { approve: approvePendingRole, reject: rejectPendingRole },
};

export const runQueueAction: QueueActionFn = async ({ queueId, actionId, itemIds, reason }) => {
  await requireModerator();

  if (!isQueueId(queueId)) return { ok: false, error: "Unknown queue." };
  const command = DISPATCH[queueId]?.[actionId];
  if (!command) {
    return { ok: false, error: `Action "${actionId}" isn't wired for this queue yet.` };
  }

  const user = await currentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // A reject must carry a reason (audit trail). The client enforces it; this is
  // the server-side backstop.
  if (actionId === "reject" && !reason?.trim()) {
    return { ok: false, error: "A reason is required to reject." };
  }

  const db = getDb();
  const mod = await getOrCreateUserByClerkId(db, {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress,
  });

  const processed: string[] = [];
  try {
    for (const id of itemIds) {
      const changed = await command(db, { id, modUserId: mod.id, reason: reason?.trim() });
      if (changed) processed.push(id);
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "The action failed.",
    };
  }

  revalidatePath(`/admin/queues/${queueId}`);
  return { ok: true, processed };
};
