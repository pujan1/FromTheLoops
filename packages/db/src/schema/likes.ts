import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { comments } from "./comments.js";
import { interviewReports } from "./reports.js";
import { users } from "./users.js";

// Lightweight likes (ADR-0011) — a casual "👍/♥" toggle on a post or a comment,
// open to ANY signed-in user. Deliberately separate from helpful_flags, which
// stays the verified, karma-weighted *quality* signal: a like is vanity, a
// helpful-flag is a curated endorsement. Two dedicated tables (not one
// polymorphic `likes`) so each keeps a real FK + cascade, matching the
// helpful_flags shape.
//
// Each is a TOGGLE: insert to like, delete to un-like, one row per (target,
// user) via the unique index. Self-like is blocked in the data-access layer
// (you can't like your own report/comment), as helpful_flags blocks self-flag.
//
// Karma: the vanity COUNT earns nobody anything. The karma earn term for
// comment likes (small, per-comment-capped + daily-globally-capped — ADR-0011)
// is recompute-side logic in karma.ts and derives from comment_likes rows; the
// (user_id, created_at) index below backs that daily-window read.
//
// Cascade: BOTH FKs ON DELETE CASCADE on each table — a like is ephemeral
// engagement with no audit value, so it goes when its target or its user is
// hard-deleted (same stance as helpful_flags).

export const postLikes = pgTable(
  "post_likes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reportId: uuid("report_id")
      .notNull()
      .references(() => interviewReports.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One like per (report, user): the toggle's idempotency + anti-double-like.
    // Its leading column also backs "count likes on this report".
    uniqueIndex("post_likes_report_user_uq").on(t.reportId, t.userId),
    index("post_likes_report_idx").on(t.reportId),
  ],
);

export const commentLikes = pgTable(
  "comment_likes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One like per (comment, user); leading column backs "count likes on this
    // comment" (the badge + the karma earn's per-comment tally).
    uniqueIndex("comment_likes_comment_user_uq").on(t.commentId, t.userId),
    index("comment_likes_comment_idx").on(t.commentId),
    // The karma daily-cap window read: "likes given by this user since T"
    // (a like *given* maps to karma *received* by the commenter). Mirrors
    // helpful_flags_flagger_created_idx.
    index("comment_likes_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type PostLike = typeof postLikes.$inferSelect;
export type NewPostLike = typeof postLikes.$inferInsert;
export type CommentLike = typeof commentLikes.$inferSelect;
export type NewCommentLike = typeof commentLikes.$inferInsert;
