// Community abuse-reports queue. The unit of decision is the content, not each
// flag: open flags are grouped by (target_type, target_id) and one action
// resolves them all.

import { and, eq, inArray } from "drizzle-orm";
import { emitReportEvent } from "../pipeline/events.js";
import { comments, companies, contentFlags, interviewReports, roles, users } from "../schema/index.js";
import { type Command, type Db, type Executor, logModAction } from "./shared.js";
import type { ContentFlagItem } from "./types.js";

// Split "report:<uuid>" | "comment:<uuid>"; empty kind for anything malformed.
function parseTarget(id: string): { kind: "report" | "comment" | ""; targetId: string } {
  const sep = id.indexOf(":");
  const kind = sep === -1 ? "" : id.slice(0, sep);
  const targetId = sep === -1 ? "" : id.slice(sep + 1);
  if ((kind !== "report" && kind !== "comment") || !targetId) return { kind: "", targetId: "" };
  return { kind, targetId };
}

export async function listContentFlags(db: Db): Promise<ContentFlagItem[]> {
  const flags = await db
    .select({
      targetType: contentFlags.targetType,
      targetId: contentFlags.targetId,
      reason: contentFlags.reason,
      createdAt: contentFlags.createdAt,
    })
    .from(contentFlags)
    .where(eq(contentFlags.status, "open"));

  if (flags.length === 0) return [];

  type Group = {
    kind: "report" | "comment";
    targetId: string;
    count: number;
    reasons: Set<string>;
    firstFlaggedAt: Date;
    lastFlaggedAt: Date;
  };
  const groups = new Map<string, Group>();
  for (const f of flags) {
    const key = `${f.targetType}:${f.targetId}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.reasons.add(f.reason);
      if (f.createdAt < g.firstFlaggedAt) g.firstFlaggedAt = f.createdAt;
      if (f.createdAt > g.lastFlaggedAt) g.lastFlaggedAt = f.createdAt;
    } else {
      groups.set(key, {
        kind: f.targetType,
        targetId: f.targetId,
        count: 1,
        reasons: new Set([f.reason]),
        firstFlaggedAt: f.createdAt,
        lastFlaggedAt: f.createdAt,
      });
    }
  }

  const all = [...groups.values()];
  const reportIds = all.filter((g) => g.kind === "report").map((g) => g.targetId);
  const commentIds = all.filter((g) => g.kind === "comment").map((g) => g.targetId);

  // Active content only — flags on already-removed content drop out of the queue.
  const reportCtx = reportIds.length
    ? await db
        .select({
          id: interviewReports.id,
          company: companies.name,
          role: roles.name,
          level: interviewReports.level,
          month: interviewReports.interviewMonth,
          authorName: users.displayName,
          authorUsername: users.username,
        })
        .from(interviewReports)
        .leftJoin(companies, eq(interviewReports.companyId, companies.id))
        .leftJoin(roles, eq(interviewReports.canonicalRoleId, roles.id))
        .leftJoin(users, eq(interviewReports.createdByUserId, users.id))
        .where(and(inArray(interviewReports.id, reportIds), eq(interviewReports.status, "active")))
    : [];

  const commentCtx = commentIds.length
    ? await db
        .select({
          id: comments.id,
          body: comments.body,
          reportId: comments.reportId,
          authorName: users.displayName,
          authorUsername: users.username,
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorUserId, users.id))
        .where(and(inArray(comments.id, commentIds), eq(comments.status, "active")))
    : [];

  const reportMap = new Map(reportCtx.map((r) => [r.id, r]));
  const commentMap = new Map(commentCtx.map((c) => [c.id, c]));

  const items: ContentFlagItem[] = [];
  for (const g of all) {
    const base = {
      id: `${g.kind}:${g.targetId}`,
      kind: g.kind,
      flagCount: g.count,
      reasons: [...g.reasons],
      firstFlaggedAt: g.firstFlaggedAt,
      lastFlaggedAt: g.lastFlaggedAt,
    };
    if (g.kind === "report") {
      const c = reportMap.get(g.targetId);
      if (!c) continue;
      items.push({
        ...base,
        primary: `${c.company ?? "Unknown company"} · ${c.role ?? "Unknown role"}`,
        secondary: [c.level, c.month].filter(Boolean).join(" · ") || null,
        author: c.authorName ?? c.authorUsername ?? null,
        href: `/reports/${g.targetId}`,
      });
    } else {
      const c = commentMap.get(g.targetId);
      if (!c) continue;
      const preview = c.body.length > 160 ? `${c.body.slice(0, 160)}…` : c.body;
      items.push({
        ...base,
        primary: preview,
        secondary: null,
        author: c.authorName ?? c.authorUsername ?? null,
        href: `/reports/${c.reportId}#comment-${g.targetId}`,
      });
    }
  }

  items.sort((a, b) => b.lastFlaggedAt.getTime() - a.lastFlaggedAt.getTime());
  return items;
}

// Resolve every open flag on one piece of content. Returns how many it cleared.
async function resolveOpenFlags(
  exec: Executor,
  targetType: "report" | "comment",
  targetId: string,
  modUserId: string,
  status: "actioned" | "dismissed",
): Promise<number> {
  const updated = await exec
    .update(contentFlags)
    .set({ status, resolvedByUserId: modUserId, resolvedAt: new Date() })
    .where(
      and(
        eq(contentFlags.targetType, targetType),
        eq(contentFlags.targetId, targetId),
        eq(contentFlags.status, "open"),
      ),
    )
    .returning({ id: contentFlags.id });
  return updated.length;
}

// Comment → 'hidden'; report → soft-'deleted' + a 'deleted' event. Idempotent;
// false (and flags left for a later dismiss) if the content is already gone.
export async function hideFlagged(db: Db, { id, modUserId, reason }: Command): Promise<boolean> {
  const { kind, targetId } = parseTarget(id);
  if (!kind) return false;

  return db.transaction(async (tx) => {
    if (kind === "comment") {
      const updated = await tx
        .update(comments)
        .set({ status: "hidden" })
        .where(and(eq(comments.id, targetId), eq(comments.status, "active")))
        .returning({ id: comments.id });
      if (updated.length === 0) return false;
      await resolveOpenFlags(tx, "comment", targetId, modUserId, "actioned");
      await logModAction(tx, { modUserId, actionType: "hide", targetType: "comment", targetId, reason });
      return true;
    }

    const updated = await tx
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(and(eq(interviewReports.id, targetId), eq(interviewReports.status, "active")))
      .returning({
        id: interviewReports.id,
        companyId: interviewReports.companyId,
        canonicalRoleId: interviewReports.canonicalRoleId,
        level: interviewReports.level,
      });
    const row = updated[0];
    if (!row) return false;
    await emitReportEvent(tx, {
      op: "deleted",
      reportId: row.id,
      companyId: row.companyId,
      canonicalRoleId: row.canonicalRoleId,
      level: row.level,
    });
    await resolveOpenFlags(tx, "report", targetId, modUserId, "actioned");
    await logModAction(tx, { modUserId, actionType: "hide", targetType: "report", targetId, reason });
    return true;
  });
}

// Dismiss flags as unfounded; content kept. No mod_action_logs row — the
// dismissal is recorded on the flag rows. False if there were no open flags.
export async function dismissFlags(db: Db, { id, modUserId }: Command): Promise<boolean> {
  const { kind, targetId } = parseTarget(id);
  if (!kind) return false;
  return db.transaction(async (tx) => {
    const cleared = await resolveOpenFlags(tx, kind, targetId, modUserId, "dismissed");
    return cleared > 0;
  });
}
