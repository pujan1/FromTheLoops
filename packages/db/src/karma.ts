// Karma — account-bound reputation (Sprint 5 Day 7).
//
// Model: recompute-from-scratch, never increment. users.karma is a denormalized
// cache; the source of truth is the user's own reports (+ helpful-flags from Day
// 8). recomputeUserKarma rebuilds the whole figure for one user, so it's fully
// idempotent — the worker can re-run it on every relevant event, on a retry,
// or from a backfill, and always lands on the same value. That's the same
// "recompute the cell" stance the aggregate refresh takes (PLAN.md §Karma).
//
// Pure persistence, like reports.ts: no shared/core dep — the earn constants
// live here (the rule is a backend invariant, not display logic) so the db
// package stays self-contained.
//
// Earn rule (PLAN.md §Karma "submission base 5 unverified / 10 verified-pro /
// 25 recruiter-confirmed" + helpfulness flags from readers):
//   - unverified ............ 5   — author holds no verification for the report's company
//   - verified-pro .......... 10  — author has a user_verifications row for that company
//   - recruiter-confirmed ... 25  — per-report Layer-3 evidence approved (deferred: see below)
//   - helpful-flag .......... +1  — per flag on the author's reports from ANOTHER verified
//                                   user (Day 8). The flagger's verification is re-checked
//                                   live here, so a flag from a since-unverified account
//                                   stops counting on the next recompute.
//   - comment-like .......... +1  — per like on the author's ACTIVE comments (ADR-0011).
//                                   Unlike helpful-flags, ANY signed-in liker counts (no
//                                   verification gate), so it is DOUBLE-CAPPED to blunt
//                                   farming: at most N likes/comment/day count, and at most
//                                   M karma/day total from comment-likes, summed across
//                                   days. Capping per-day on the LIKE's created_at keeps the
//                                   term a pure function of the like rows, so it stays
//                                   idempotent under from-scratch recompute. Self-likes are
//                                   excluded defensively (the write path already blocks them).
//
// Recruiter-confirmed is DEFERRED, not dropped: Layer-3 per-report evidence
// (PLAN.md §Trust, the "✓✓ Recruiter-Confirmed" badge) is admin-reviewed and
// has no storage until the moderation tools in Sprint 6. The constant exists and
// the recompute will pick it up the moment a per-report "evidence approved" flag
// lands; today no report reaches that tier, so the rule degrades cleanly to the
// 5/10 split.

import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";
import { users } from "./schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;

// The per-submission base award by trust tier. Exported so tests assert against
// the rule, not a magic number, and Day 8's helpful-flag earn can sit beside it.
export const KARMA_EARN = {
  unverified: 5,
  verifiedPro: 10,
  recruiterConfirmed: 25,
  helpfulFlag: 1,
  commentLike: 1,
} as const;

// Anti-farm caps on the comment-like earn term (ADR-0011). Tunable — these are
// unproven launch defaults; tighten if farming shows up, or switch to a
// verified-liker gate like helpful-flags. Applied per author per day:
//   - PER_COMMENT: a single comment's likes count toward karma only up to this
//     many per day (one viral comment can't dominate).
//   - DAILY_TOTAL: the most karma a user can earn from comment-likes in a day,
//     across all their comments.
export const COMMENT_LIKE_KARMA_PER_COMMENT_DAILY_CAP = 5;
export const COMMENT_LIKE_KARMA_DAILY_CAP = 10;

export interface RecomputeKarmaResult {
  // The newly persisted karma total. 0 if the user doesn't exist.
  karma: number;
  // The value before this recompute, so the caller can detect/log a tier
  // crossing (e.g. 9 → 10) without re-reading. Equals `karma` when nothing moved.
  previous: number;
  // True iff the total actually changed — the worker only logs/acts on moves.
  changed: boolean;
  // False only when no such user row exists (the event named a report whose
  // author was hard-deleted, etc); the caller treats it as a benign no-op.
  found: boolean;
}

// Recompute one user's karma from scratch and persist it. Sums the per-report
// base award across the user's NON-deleted reports — a report's tier is read
// live from user_verifications (the author holds a verification for that
// report's company → verified-pro), so the figure self-heals when a
// verification is added later, regardless of whether the denormalized
// reports.evidence_verified flag has caught up. Deleted reports earn nothing
// (deleting your report withdraws its karma).
//
// One transaction: read the prior karma (so we can report the delta), compute
// the new total, write it. A no-such-user id is a benign no-op (found=false).
export async function recomputeUserKarma(
  db: Db,
  userId: string,
): Promise<RecomputeKarmaResult> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ karma: users.karma })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!existing[0]) {
      return { karma: 0, previous: 0, changed: false, found: false };
    }
    const previous = existing[0].karma;

    // Karma = submission base + helpful-flag earn, both over the user's live
    // (non-deleted) reports. Two scalar subqueries summed:
    //   1. base per report — verified-pro (author verified at that report's
    //      company) → 10, else 5. recruiter-confirmed (25) joins this CASE once
    //      Layer-3 evidence has storage.
    //   2. +1 per helpful flag on those reports from ANOTHER verified user. The
    //      flagger's verification is re-checked here (EXISTS) so the earn
    //      self-heals; self-flags are excluded defensively even though the
    //      flag-write path already blocks them.
    const computed = await tx.execute<{ karma: number | string }>(sql`
      SELECT (
        COALESCE((
          SELECT SUM(
            CASE WHEN EXISTS (
              SELECT 1 FROM user_verifications v
               WHERE v.user_id = r.created_by_user_id
                 AND v.company_id = r.company_id
            ) THEN ${KARMA_EARN.verifiedPro}::int
              ELSE ${KARMA_EARN.unverified}::int
            END
          )
          FROM interview_reports r
          WHERE r.created_by_user_id = ${userId}::uuid
            AND r.status <> 'deleted'
        ), 0)
        +
        COALESCE((
          SELECT COUNT(*) * ${KARMA_EARN.helpfulFlag}::int
          FROM helpful_flags hf
          JOIN interview_reports r2 ON r2.id = hf.report_id
          WHERE r2.created_by_user_id = ${userId}::uuid
            AND r2.status <> 'deleted'
            AND hf.flagger_user_id <> r2.created_by_user_id
            AND EXISTS (
              SELECT 1 FROM user_verifications v2
               WHERE v2.user_id = hf.flagger_user_id
            )
        ), 0)
        +
        -- 3. comment-like earn, double-capped per author per day. Inner query:
        --    likes per (comment, day) capped at PER_COMMENT. Middle: sum those
        --    within a day, capped at DAILY_TOTAL. Outer: sum the capped days.
        COALESCE((
          SELECT SUM(per_day_capped)::int FROM (
            SELECT LEAST(
                     SUM(per_comment_capped),
                     ${COMMENT_LIKE_KARMA_DAILY_CAP}::int
                   ) AS per_day_capped
            FROM (
              SELECT
                date_trunc('day', cl.created_at) AS like_day,
                LEAST(
                  COUNT(*),
                  ${COMMENT_LIKE_KARMA_PER_COMMENT_DAILY_CAP}::int
                ) * ${KARMA_EARN.commentLike}::int AS per_comment_capped
              FROM comments c
              JOIN comment_likes cl ON cl.comment_id = c.id
              WHERE c.author_user_id = ${userId}::uuid
                AND c.status = 'active'
                AND cl.user_id <> c.author_user_id
              GROUP BY c.id, date_trunc('day', cl.created_at)
            ) per_comment_day
            GROUP BY like_day
          ) per_day
        ), 0)
      )::int AS karma
    `);
    const karma = Number(computed[0]?.karma ?? 0);

    if (karma !== previous) {
      await tx.update(users).set({ karma }).where(eq(users.id, userId));
    }
    return { karma, previous, changed: karma !== previous, found: true };
  });
}
