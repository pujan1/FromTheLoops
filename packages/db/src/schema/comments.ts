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

// `comments` — flat discussion attached to an interview_report (ADR-0011).
//
// FLAT by design: there is no nesting (no Reddit tree). A comment may carry up
// to one quote-reference, rendered as a collapsed one-liner — either:
//   - quoted_question_id (+ quoted_text snapshot): quotes a question from the
//     report, or
//   - reply_to_comment_id: quotes another comment (still rendered flat).
// The UI attaches at most one; the schema leaves both nullable independently.
//
// Why a frozen quoted_text snapshot alongside the FK: a report is editable for
// 24h and its questions hard-delete via cascade, so the FK alone would let an
// edit silently rewrite the quote — or a delete vanish it. The snapshot freezes
// what the commenter actually quoted; the FK (ON DELETE SET NULL) only powers
// "jump to that question in the post" while it still exists. The snapshot is
// free-text PII and is cleared by the 90-day purge alongside the body.
//
// Identity: display_attribution mirrors interview_reports — a per-comment
// anon/name toggle, anonymous by default (the platform's anonymity-first
// stance). The author's account default is applied by the write path.
//
// Lifecycle (status, see enums.ts commentStatus): `active` on insert (instant
// post, reactive moderation); a moderator can flip it to `hidden`; the author
// soft-deletes to `deleted` (deleted_at stamped). The row always survives so a
// reply/quote pointing at it renders a placeholder rather than dangling.
//
// FK semantics:
//   - report_id ON DELETE CASCADE — a report is normally soft-deleted (status
//     flips, comments hidden with it), so this cascade is only reached on a hard
//     purge; then comments shouldn't dangle. Mirrors helpful_flags.
//   - author_user_id ON DELETE RESTRICT — same stance as interview_reports:
//     never hard-delete a user who has authored content; the soft-delete +
//     90-day purge path handles erasure.
//   - reply_to_comment_id / quoted_question_id ON DELETE SET NULL — the
//     referenced comment/question can go away; this comment stays, and the
//     snapshot (for questions) keeps the quote readable.
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
    // Plain text, validated (length cap) in the data-access layer / Zod. Rendered
    // escaped with URLs auto-linkified rel="nofollow ugc" — no markdown/HTML.
    body: text("body").notNull(),
    displayAttribution: displayAttribution("display_attribution")
      .notNull()
      .default("anonymous"),
    // Flat reply to another comment on the same report. Self-referential FK —
    // the AnyPgColumn annotation is required for Drizzle to resolve the type.
    replyToCommentId: uuid("reply_to_comment_id").references(
      (): AnyPgColumn => comments.id,
      { onDelete: "set null" },
    ),
    // The quoted question (link, for jump-to) + a frozen copy of its prose at
    // quote-time (display, stable across edits/deletes).
    quotedQuestionId: uuid("quoted_question_id").references(() => questions.id, {
      onDelete: "set null",
    }),
    quotedText: text("quoted_text"),
    status: commentStatus("status").notNull().default("active"),
    // Stamped when the author edits the body (drives the "(edited)" marker).
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Author soft-delete timestamp; set when status flips to 'deleted'.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Set by the 90-day purge worker once a deleted comment's free-text PII
    // (body + quoted_text) has been cleared. Gates re-runs so the sweep is
    // idempotent — mirrors interview_reports.pii_purged_at.
    piiPurgedAt: timestamp("pii_purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // THE thread read: comments for a report, newest- or oldest-first. A btree
    // index serves both directions, so this one index backs the default
    // newest-first list and any oldest-first variant.
    index("comments_report_created_idx").on(t.reportId, t.createdAt),
    // The /u/[username] "my comments" read + author-scoped purge sweeps.
    index("comments_author_idx").on(t.authorUserId),
    // Resolve replies pointing at a given comment (placeholder rendering, and
    // SET NULL fan-out checks).
    index("comments_reply_to_idx").on(t.replyToCommentId),
    // Tie comments back to a question (the "how many discussed this Q" read).
    index("comments_quoted_question_idx").on(t.quotedQuestionId),
  ],
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
