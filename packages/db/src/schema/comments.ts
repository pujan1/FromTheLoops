import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { commentStatus, displayAttribution } from "./enums.js";
import { questions } from "./questions.js";
import { interviewReports } from "./reports.js";
import { users } from "./users.js";

// Flat discussion on a report (no nesting). A comment may carry one quote-ref:
// quoted_question_id (+ frozen quoted_text snapshot) or reply_to_comment_id.
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reportId: uuid("report_id")
      .notNull()
      .references(() => interviewReports.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Plain text, escaped + URLs linkified rel="nofollow ugc" on render. No HTML.
    body: text("body").notNull(),
    displayAttribution: displayAttribution("display_attribution")
      .notNull()
      .default("anonymous"),
    // Self-FK (AnyPgColumn required by Drizzle).
    replyToCommentId: uuid("reply_to_comment_id").references(
      (): AnyPgColumn => comments.id,
      { onDelete: "set null" },
    ),
    quotedQuestionId: uuid("quoted_question_id").references(() => questions.id, {
      onDelete: "set null",
    }),
    quotedText: text("quoted_text"), // frozen at quote-time, stable across edits/deletes
    status: commentStatus("status").notNull().default("active"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    piiPurgedAt: timestamp("pii_purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("comments_report_created_idx").on(t.reportId, t.createdAt), // the thread read
    index("comments_author_idx").on(t.authorUserId),
    index("comments_reply_to_idx").on(t.replyToCommentId),
    index("comments_quoted_question_idx").on(t.quotedQuestionId),
  ],
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
