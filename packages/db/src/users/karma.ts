// Recompute-from-scratch reputation: users.karma is a denormalized cache, fully
// rebuilt per user so it stays idempotent under retries/backfills. Earn rule:
// base 5 unverified / 10 verified-pro / 25 recruiter-confirmed (deferred, no
// storage yet), +1 per helpful-flag from another verified user, +1 per
// comment-like (double-capped, see below).

import { eq, sql } from "drizzle-orm";
import type { Db } from "../lib/types.js";
import { users } from "../schema/index.js";

export const KARMA_EARN = {
  unverified: 5,
  verifiedPro: 10,
  recruiterConfirmed: 25,
  helpfulFlag: 1,
  commentLike: 1,
} as const;

// Anti-farm caps on the comment-like term, per author per day.
export const COMMENT_LIKE_KARMA_PER_COMMENT_DAILY_CAP = 5;
export const COMMENT_LIKE_KARMA_DAILY_CAP = 10;

export interface RecomputeKarmaResult {
  karma: number;
  previous: number; // value before this recompute, for delta logging
  changed: boolean;
  found: boolean; // false when no such user row (benign no-op)
}

// Sums the per-report base (tier read live from user_verifications, so it
// self-heals) over non-deleted reports, plus the flag/like terms. Idempotent.
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

    // Three summed scalar subqueries: per-report base, helpful-flag earn (+1 per
    // flag from another verified user), comment-like earn (see below).
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
        -- comment-like earn, double-capped: per (comment, day), then per day.
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
