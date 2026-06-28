// Soft-deleted reports + comments still inside the PII-purge window, so a mod can
// reverse a deletion. Purged rows (pii_purged_at set) are excluded.

import { and, eq, gte, isNull } from "drizzle-orm";
import { comments, companies, interviewReports, roles, users } from "../schema/index.js";
import { PII_RETENTION_MS } from "../reports/reports.js";
import { daysUntil } from "../lib/time.js";
import { type Command, type Db, logModAction } from "./shared.js";
import type { SoftDeletedItem } from "./types.js";

const daysLeftUntilPurge = (deletedAt: Date): number =>
  daysUntil(new Date(deletedAt.getTime() + PII_RETENTION_MS));

export async function listSoftDeleted(db: Db): Promise<SoftDeletedItem[]> {
  const cutoff = new Date(Date.now() - PII_RETENTION_MS);

  const reportRows = await db
    .select({
      id: interviewReports.id,
      company: companies.name,
      role: roles.name,
      level: interviewReports.level,
      month: interviewReports.interviewMonth,
      deletedAt: interviewReports.deletedAt,
      authorName: users.displayName,
      authorUsername: users.username,
    })
    .from(interviewReports)
    .leftJoin(companies, eq(interviewReports.companyId, companies.id))
    .leftJoin(roles, eq(interviewReports.canonicalRoleId, roles.id))
    .leftJoin(users, eq(interviewReports.createdByUserId, users.id))
    .where(
      and(
        eq(interviewReports.status, "deleted"),
        isNull(interviewReports.piiPurgedAt),
        gte(interviewReports.deletedAt, cutoff),
      ),
    );

  const commentRows = await db
    .select({
      id: comments.id,
      body: comments.body,
      reportId: comments.reportId,
      deletedAt: comments.deletedAt,
      authorName: users.displayName,
      authorUsername: users.username,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorUserId, users.id))
    .where(
      and(
        eq(comments.status, "deleted"),
        isNull(comments.piiPurgedAt),
        gte(comments.deletedAt, cutoff),
      ),
    );

  const items: SoftDeletedItem[] = [];

  for (const r of reportRows) {
    if (!r.deletedAt) continue; // narrow for TS
    items.push({
      id: `report:${r.id}`,
      kind: "report",
      primary: `${r.company ?? "Unknown company"} · ${r.role ?? "Unknown role"}`,
      secondary: [r.level, r.month].filter(Boolean).join(" · ") || null,
      author: r.authorName ?? r.authorUsername ?? null,
      deletedAt: r.deletedAt,
      daysLeft: daysLeftUntilPurge(r.deletedAt),
    });
  }

  for (const c of commentRows) {
    if (!c.deletedAt) continue;
    const preview = c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body;
    items.push({
      id: `comment:${c.id}`,
      kind: "comment",
      primary: preview,
      secondary: null,
      author: c.authorName ?? c.authorUsername ?? null,
      deletedAt: c.deletedAt,
      daysLeft: daysLeftUntilPurge(c.deletedAt),
    });
  }

  items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  return items;
}

// 'deleted' → 'active'. Guarded by status + pii_purged_at IS NULL: idempotent
// and refuses to restore already-purged content.
export async function restoreSoftDeleted(db: Db, { id, modUserId }: Command): Promise<boolean> {
  const sep = id.indexOf(":");
  const kind = sep === -1 ? "" : id.slice(0, sep);
  const targetId = sep === -1 ? "" : id.slice(sep + 1);
  if (!targetId || (kind !== "report" && kind !== "comment")) return false;

  return db.transaction(async (tx) => {
    if (kind === "report") {
      const updated = await tx
        .update(interviewReports)
        .set({ status: "active", deletedAt: null })
        .where(
          and(
            eq(interviewReports.id, targetId),
            eq(interviewReports.status, "deleted"),
            isNull(interviewReports.piiPurgedAt),
          ),
        )
        .returning({ id: interviewReports.id });
      if (updated.length === 0) return false;
      await logModAction(tx, { modUserId, actionType: "restore", targetType: "report", targetId });
      return true;
    }

    const updated = await tx
      .update(comments)
      .set({ status: "active", deletedAt: null })
      .where(
        and(
          eq(comments.id, targetId),
          eq(comments.status, "deleted"),
          isNull(comments.piiPurgedAt),
        ),
      )
      .returning({ id: comments.id });
    if (updated.length === 0) return false;
    await logModAction(tx, { modUserId, actionType: "restore", targetType: "comment", targetId });
    return true;
  });
}
