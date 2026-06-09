// Helpful-flags data-access (Sprint 5 Day 8).
//
// A helpful-flag is a reader's standing "this report helped me" endorsement —
// a TOGGLE (insert to flag, delete to un-flag), one per (report, reader). The
// report author earns +1 karma per flag from another verified user; that earn
// lives in karma.ts and re-derives from these rows, so the write paths here
// recompute the AUTHOR's karma after a change rather than incrementing anything.
//
// Three guards blunt the sock-puppet vector (sprint risk table):
//   - no self-flag (you can't endorse your own report),
//   - flagger must be verified-pro (userIsVerified),
//   - 50 flags / rolling 24h / user (HELPFUL_FLAG_DAILY_LIMIT).
// All three are enforced here, server-side — the UI hides the control in these
// cases, but a hand-crafted POST must not slip past.

import { and, eq, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { recomputeUserKarma } from "./karma.js";
import { helpfulFlags, interviewReports } from "./schema/index.js";
import * as schema from "./schema/index.js";
import { userIsVerified } from "./users.js";

type Db = PostgresJsDatabase<typeof schema>;

// Rolling-window rate limit (sprint exit criterion: 50/day/user). A rolling 24h
// window, not a calendar day — avoids timezone ambiguity and bounds burst
// flagging, which is the abuse we care about. Counts flags that still EXIST in
// the window (an un-flagged row is gone), so the cap bounds standing flags.
export const HELPFUL_FLAG_DAILY_LIMIT = 50;
export const HELPFUL_FLAG_WINDOW_MS = 24 * 60 * 60 * 1000;

// How many readers have flagged this report helpful — the detail-page badge.
export async function countHelpfulFlags(
  db: Db,
  reportId: string,
): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM helpful_flags WHERE report_id = ${reportId}::uuid`,
  );
  return Number(rows[0]?.n ?? 0);
}

// Has THIS viewer already flagged THIS report? Drives the button's on/off state.
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

// The reasons a flag attempt is refused. The UI maps each to a hint; the action
// returns them so the reader learns WHY (esp. rate-limited / verify-to-flag).
export type FlagRefusal =
  | "self_flag"
  | "not_verified"
  | "rate_limited"
  | "not_found";

export type FlagResult =
  | { ok: true; flagged: true; count: number }
  | { ok: false; reason: FlagRefusal };

// Cast a helpful-flag. Idempotent: if the reader has already flagged this
// report it's a benign success (no rate consumed, no duplicate). Otherwise runs
// the three guards, inserts, and recomputes the AUTHOR's karma so the +1 lands
// immediately. Returns the new flag count on success, or the refusal reason.
export async function flagReportHelpful(
  db: Db,
  input: { reportId: string; flaggerUserId: string },
): Promise<FlagResult> {
  const { reportId, flaggerUserId } = input;

  // The report must exist and be non-deleted; we need its author for the
  // self-flag check and the karma recompute. One read serves both.
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

  // Already flagged → idempotent success, no guard spend.
  if (await hasUserFlaggedReport(db, reportId, flaggerUserId)) {
    return { ok: true, flagged: true, count: await countHelpfulFlags(db, reportId) };
  }

  if (!(await userIsVerified(db, flaggerUserId))) {
    return { ok: false, reason: "not_verified" };
  }
  if (await reachedDailyLimit(db, flaggerUserId)) {
    return { ok: false, reason: "rate_limited" };
  }

  // onConflictDoNothing guards the race where two requests insert the same flag
  // between the check above and here — the unique index makes the loser a no-op.
  await db
    .insert(helpfulFlags)
    .values({ reportId, flaggerUserId })
    .onConflictDoNothing();

  await recomputeUserKarma(db, report.authorId);

  return { ok: true, flagged: true, count: await countHelpfulFlags(db, reportId) };
}

// Remove the reader's flag. Always allowed (you may withdraw your own
// endorsement) — no verified/rate checks. A no-op if there was no flag. Returns
// the new count. Recomputes the author's karma so the −1 lands immediately.
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

// Has this user hit the rolling-24h flag cap? Counts their still-standing flags
// in the window; rides helpful_flags_flagger_created_idx.
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
