// Reader "this helped me" endorsement toggle, one per (report, reader). Earns
// the author +1 karma (recomputed, not incremented). Three server-side guards:
// no self-flag, flagger must be verified, 50/rolling-24h/user.

import { and, eq, gte, sql } from "drizzle-orm";
import { recomputeUserKarma } from "../users/karma.js";
import { helpfulFlags, interviewReports } from "../schema/index.js";
import type { Db } from "../lib/types.js";
import { DAY_MS } from "../lib/time.js";
import { userIsVerified } from "../users/users.js";

export const HELPFUL_FLAG_DAILY_LIMIT = 50;
export const HELPFUL_FLAG_WINDOW_MS = DAY_MS;

export async function countHelpfulFlags(
  db: Db,
  reportId: string,
): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM helpful_flags WHERE report_id = ${reportId}::uuid`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function hasUserFlaggedReport(
  db: Db,
  reportId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: helpfulFlags.id })
    .from(helpfulFlags)
    .where(
      and(
        eq(helpfulFlags.reportId, reportId),
        eq(helpfulFlags.flaggerUserId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export type FlagRefusal =
  | "self_flag"
  | "not_verified"
  | "rate_limited"
  | "not_found";

export type FlagResult =
  | { ok: true; flagged: true; count: number }
  | { ok: false; reason: FlagRefusal };

// Idempotent (already-flagged → benign success, no guard spend). Otherwise runs
// the three guards, inserts, and recomputes the author's karma.
export async function flagReportHelpful(
  db: Db,
  input: { reportId: string; flaggerUserId: string },
): Promise<FlagResult> {
  const { reportId, flaggerUserId } = input;

  // One read serves the self-flag check + the karma recompute.
  const reportRows = await db
    .select({
      authorId: interviewReports.createdByUserId,
      status: interviewReports.status,
    })
    .from(interviewReports)
    .where(eq(interviewReports.id, reportId))
    .limit(1);
  const report = reportRows[0];
  if (!report || report.status === "deleted") {
    return { ok: false, reason: "not_found" };
  }
  if (report.authorId === flaggerUserId) {
    return { ok: false, reason: "self_flag" };
  }

  if (await hasUserFlaggedReport(db, reportId, flaggerUserId)) {
    return { ok: true, flagged: true, count: await countHelpfulFlags(db, reportId) };
  }

  if (!(await userIsVerified(db, flaggerUserId))) {
    return { ok: false, reason: "not_verified" };
  }
  if (await reachedDailyLimit(db, flaggerUserId)) {
    return { ok: false, reason: "rate_limited" };
  }

  // onConflictDoNothing guards the check-then-insert race.
  await db
    .insert(helpfulFlags)
    .values({ reportId, flaggerUserId })
    .onConflictDoNothing();

  await recomputeUserKarma(db, report.authorId);

  return { ok: true, flagged: true, count: await countHelpfulFlags(db, reportId) };
}

// No-op if there was no flag. Recomputes the author's karma.
export async function unflagReportHelpful(
  db: Db,
  input: { reportId: string; flaggerUserId: string },
): Promise<{ ok: true; flagged: false; count: number }> {
  const { reportId, flaggerUserId } = input;

  const authorRows = await db
    .select({ authorId: interviewReports.createdByUserId })
    .from(interviewReports)
    .where(eq(interviewReports.id, reportId))
    .limit(1);

  await db
    .delete(helpfulFlags)
    .where(
      and(
        eq(helpfulFlags.reportId, reportId),
        eq(helpfulFlags.flaggerUserId, flaggerUserId),
      ),
    );

  const authorId = authorRows[0]?.authorId;
  if (authorId) await recomputeUserKarma(db, authorId);

  return { ok: true, flagged: false, count: await countHelpfulFlags(db, reportId) };
}

async function reachedDailyLimit(db: Db, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - HELPFUL_FLAG_WINDOW_MS);
  const rows = await db
    .select({ id: helpfulFlags.id })
    .from(helpfulFlags)
    .where(
      and(
        eq(helpfulFlags.flaggerUserId, userId),
        gte(helpfulFlags.createdAt, since),
      ),
    )
    .limit(HELPFUL_FLAG_DAILY_LIMIT);
  return rows.length >= HELPFUL_FLAG_DAILY_LIMIT;
}
