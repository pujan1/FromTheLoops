// The read side of the audit log (Sprint 6 Day 4). logModAction (./shared.js)
// writes; this reads back. One query serves two surfaces: pass no target
// for the global recent-activity feed (/admin/audit), or a (targetType,
// targetId) pair for "everything that happened to this entity". Joins the acting
// mod so the view shows a name, not a UUID. Newest-first; capped so the global
// feed can't run away.

import { and, desc, eq } from "drizzle-orm";
import { modActionLogs, users } from "../schema/index.js";
import type { Db } from "./shared.js";
import type { ModActionLogItem } from "./types.js";

export async function listModActions(
  db: Db,
  opts: { targetType?: string; targetId?: string; limit?: number } = {},
): Promise<ModActionLogItem[]> {
  const filters = [];
  if (opts.targetType) filters.push(eq(modActionLogs.targetType, opts.targetType));
  if (opts.targetId) filters.push(eq(modActionLogs.targetId, opts.targetId));

  const rows = await db
    .select({
      id: modActionLogs.id,
      actionType: modActionLogs.actionType,
      targetType: modActionLogs.targetType,
      targetId: modActionLogs.targetId,
      reason: modActionLogs.reason,
      metadata: modActionLogs.metadata,
      createdAt: modActionLogs.createdAt,
      modDisplayName: users.displayName,
      modUsername: users.username,
      modKarma: users.karma,
    })
    .from(modActionLogs)
    .leftJoin(users, eq(modActionLogs.modUserId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(modActionLogs.createdAt))
    .limit(opts.limit ?? 100);

  return rows.map((r) => ({
    id: r.id,
    actionType: r.actionType,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt,
    modName: r.modDisplayName ?? r.modUsername ?? null,
    modKarma: r.modKarma,
  }));
}
