// The new-user-hold queue (Sprint 6 Day 7). First submissions from accounts that
// haven't cleared the trust bar land 'pending_moderation' (decideInitialReport-
// Status in @fromtheloop/core) — invisible to every public surface until a mod
// releases them. In V1, nothing sets evidence_verified yet, so EVERY report is
// held here: this is the live content gate. Approve → 'active'; reject →
// 'rejected'.

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

// Release a held report. Going pending→active makes it newly countable, so we
// emit an 'updated' report event in the same tx: the aggregate cell recomputes
// (its refresh filters status='active') and the search consumer upserts the doc.
// Guarded by status='pending_moderation' → idempotent, double-approve = false.
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

// Reject a held report → 'rejected' (distinct from author 'deleted'; see the
// enum note). It was never active, so no aggregate/search doc exists to revoke —
// no event needed. Logged with the required reason.
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
