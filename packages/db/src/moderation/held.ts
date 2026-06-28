// New-user-hold queue: reports in 'pending_moderation', invisible publicly until
// a mod releases them. Approve → 'active'; reject → 'rejected'.

import { and, desc, eq } from "drizzle-orm";
import { emitReportEvent } from "../pipeline/events.js";
import { companies, interviewReports, roles, users } from "../schema/index.js";
import { type Command, type Db, logModAction } from "./shared.js";
import type { HeldReportItem } from "./types.js";

export async function listHeldReports(db: Db): Promise<HeldReportItem[]> {
  const rows = await db
    .select({
      id: interviewReports.id,
      company: companies.name,
      role: roles.name,
      level: interviewReports.level,
      month: interviewReports.interviewMonth,
      outcome: interviewReports.outcome,
      createdAt: interviewReports.createdAt,
      authorName: users.displayName,
      authorUsername: users.username,
      authorKarma: users.karma,
    })
    .from(interviewReports)
    .leftJoin(companies, eq(interviewReports.companyId, companies.id))
    .leftJoin(roles, eq(interviewReports.canonicalRoleId, roles.id))
    .leftJoin(users, eq(interviewReports.createdByUserId, users.id))
    .where(eq(interviewReports.status, "pending_moderation"))
    .orderBy(desc(interviewReports.createdAt));

  return rows.map((r) => ({
    id: r.id,
    company: r.company ?? "Unknown company",
    role: r.role ?? "Unknown role",
    level: r.level,
    month: r.month,
    outcome: r.outcome,
    createdAt: r.createdAt,
    author: r.authorName ?? r.authorUsername ?? null,
    authorKarma: r.authorKarma,
  }));
}

// pending→active makes the report countable, so emit an 'updated' event in the
// same tx (recomputes the aggregate cell, upserts the search doc). Idempotent.
export async function approveHeldReport(db: Db, { id, modUserId }: Command): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(interviewReports)
      .set({ status: "active" })
      .where(and(eq(interviewReports.id, id), eq(interviewReports.status, "pending_moderation")))
      .returning({
        id: interviewReports.id,
        companyId: interviewReports.companyId,
        canonicalRoleId: interviewReports.canonicalRoleId,
        level: interviewReports.level,
      });
    const row = updated[0];
    if (!row) return false;
    await emitReportEvent(tx, {
      op: "updated",
      reportId: row.id,
      companyId: row.companyId,
      canonicalRoleId: row.canonicalRoleId,
      level: row.level,
    });
    await logModAction(tx, { modUserId, actionType: "approve", targetType: "report", targetId: id });
    return true;
  });
}

// Never active, so no event needed to revoke an aggregate/search doc.
export async function rejectHeldReport(db: Db, { id, modUserId, reason }: Command): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(interviewReports)
      .set({ status: "rejected" })
      .where(and(eq(interviewReports.id, id), eq(interviewReports.status, "pending_moderation")))
      .returning({ id: interviewReports.id });
    if (updated.length === 0) return false;
    await logModAction(tx, { modUserId, actionType: "reject", targetType: "report", targetId: id, reason });
    return true;
  });
}
