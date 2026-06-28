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

// Like toggles on posts + comments (insert = like, delete = un-like), open to
// any signed-in user. Separate tables so each keeps a real FK + cascade. Both
// FKs CASCADE. Self-like is blocked in the data-access layer.

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
    uniqueIndex("comment_likes_comment_user_uq").on(t.commentId, t.userId),
    index("comment_likes_comment_idx").on(t.commentId),
    index("comment_likes_user_created_idx").on(t.userId, t.createdAt), // karma daily-cap window read
  ],
);

export type PostLike = typeof postLikes.$inferSelect;
export type NewPostLike = typeof postLikes.$inferInsert;
export type CommentLike = typeof commentLikes.$inferSelect;
export type NewCommentLike = typeof commentLikes.$inferInsert;
