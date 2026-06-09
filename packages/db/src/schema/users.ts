import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { displayAttribution } from "./enums.js";

// Minimal user row.
//
// Identity ownership: Clerk owns email/password/sessions; this table only
// exists so other rows (reports, mod actions, verifications) can FK to a
// stable internal UUID instead of a Clerk id (which would couple our schema
// to an external vendor's id format).
//
// Sync model: Clerk webhook → upsert here on user.created / user.updated.
// Until that webhook handler exists, rows are inserted ad hoc by the
// upsert-on-visit path, tests, and the seed script.
//
// Account lifecycle (Sprint 5 Day 6): deleted_at marks a soft-deleted account
// (the FK from interview_reports is ON DELETE RESTRICT, so we never hard-delete
// a user who has authored reports — see schema/reports.ts). pii_purged_at is
// stamped by the worker's 90-day sweep once a deleted account's PII (email,
// handle, display name, clerk id) has been scrubbed.
//
// Karma (Sprint 5 Day 7): account-bound reputation, recomputed-from-scratch by
// the worker's recompute-karma job whenever a relevant event lands (a report
// write today; helpful-flags from Day 8). It is a DENORMALIZED cache — the
// source of truth is the user's reports (+ later helpful-flags) — so the column
// can always be rebuilt by re-running the recompute. NOT NULL default 0 so a
// fresh account reads as 0 karma before its first recompute. See karma.ts for
// the earn rule and docs/adr/0005-karma-design.md (Day 9) for the non-goals
// (notably: karma never boosts the submitter's own search ranking).
//
// Future fields (deferred): role (RBAC).
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    clerkId: text("clerk_id"),
    email: text("email"),
    username: text("username"),
    displayName: text("display_name"),
    // The attribution a fresh submission defaults to for this user. The
    // submission form still lets them flip per-report; this is just the
    // starting value. Defaults to 'anonymous' — anonymous-by-default is the
    // product stance (PLAN.md §Anonymity).
    defaultDisplayAttribution: displayAttribution("default_display_attribution")
      .notNull()
      .default("anonymous"),
    // Denormalized reputation cache; rebuilt by the recompute-karma worker job.
    // Never written by a read path — only the recompute sets it. See karma.ts.
    karma: integer("karma").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft-delete: when the user deletes their account. The row survives (the
    // report FK is ON DELETE RESTRICT and the row is the audit anchor); every
    // active code path treats a stamped row as gone.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Set by the worker's 90-day sweep after a deleted account's PII is
    // scrubbed; gates re-runs so the sweep is idempotent.
    piiPurgedAt: timestamp("pii_purged_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_clerk_id_uq").on(t.clerkId),
    uniqueIndex("users_username_uq").on(t.username),
    index("users_email_idx").on(t.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
