// User data-access helpers.
//
// Identity ownership: Clerk owns auth; this table holds a stable internal
// UUID that everything else FKs to (see schema/users.ts). Until the Clerk
// webhook sync lands, every authenticated entry point upserts-on-visit via
// getOrCreateUserByClerkId so a `users` row is guaranteed to exist before we
// write anything that references it (drafts, reports, …).

import { and, asc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { emitReportEvent } from "../pipeline/events.js";
import { PII_RETENTION_MS } from "../reports/reports.js";
import {
  companies,
  drafts,
  interviewReports,
  questions,
  questionTopics,
  roles,
  rounds,
  topics,
  type User,
  userVerifications,
  users,
} from "../schema/index.js";
import type { Db } from "../lib/types.js";

export interface ClerkIdentity {
  clerkId: string;
  email?: string | null;
}

// Idempotent on clerk_id (users_clerk_id_uq). Refreshes email on repeat
// visits; returns the internal row so callers get the UUID to FK against.
export async function getOrCreateUserByClerkId(
  db: Db,
  identity: ClerkIdentity,
): Promise<User> {
  const rows = await db
    .insert(users)
    .values({ clerkId: identity.clerkId, email: identity.email ?? null })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email: sql`excluded.email` },
    })
    .returning();
  if (rows[0]) return rows[0];

  // onConflictDoUpdate returns the row in practice; this fallback guards the
  // theoretical empty-returning case rather than handing back undefined.
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, identity.clerkId))
    .limit(1);
  const row = existing[0];
  if (!row) {
    throw new Error(`getOrCreateUserByClerkId: no row for ${identity.clerkId}`);
  }
  return row;
}

// Fetch by internal id. Used by the new-user moderation-hold decision, which
// needs the account's created_at to measure age. null if no such row.
export async function getUserById(db: Db, id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

// Fetch by public handle. Drives the /u/[username] profile resolve — the
// username is the URL key (never the internal UUID or Clerk id). Exact match
// on the unique index (users_username_uq); a non-matching handle returns null,
// which the route turns into a 404. null usernames (rows that never set a
// handle) are never returned because the predicate is an equality on a value.
export async function getUserByUsername(
  db: Db,
  username: string,
): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows[0] ?? null;
}

// Header stats for the public profile. `publicReportCount` counts only the
// user's VISIBLE, *attributed* reports — the same display_attribution filter
// the report list applies, so the headline never promises more cards than the
// page shows (anonymous reports stay invisible here, preserving the
// anonymous-by-default contract). `verifiedAtCompanyCount` is the number of
// distinct companies the user holds a verification for (user_verifications) —
// the source of the "verified contributor" badge. Karma is intentionally
// absent: the column lands on Day 7; the profile slots it in then.
export interface UserProfileStats {
  publicReportCount: number;
  verifiedAtCompanyCount: number;
}

export async function getUserProfileStats(
  db: Db,
  userId: string,
): Promise<UserProfileStats> {
  const rows = await db.execute<{
    public_report_count: number | string;
    verified_company_count: number | string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int
         FROM interview_reports r
        WHERE r.created_by_user_id = ${userId}::uuid
          AND r.display_attribution = 'display_name'
          AND r.status = 'active'
          AND r.deleted_at IS NULL) AS public_report_count,
      (SELECT COUNT(DISTINCT v.company_id)::int
         FROM user_verifications v
        WHERE v.user_id = ${userId}::uuid) AS verified_company_count
  `);
  const row = rows[0];
  return {
    publicReportCount: row ? Number(row.public_report_count) : 0,
    verifiedAtCompanyCount: row ? Number(row.verified_company_count) : 0,
  };
}

// Is this user "verified-pro" — do they hold at least one user_verifications
// row (Layer 2 trust, PLAN.md §Trust)? Gates who may cast a helpful-flag (Day 8
// anti-sock-puppet) and mirrors the live check the karma helpful-flag earn
// makes. A single EXISTS — cheap, rides verifications_user_idx.
export async function userIsVerified(
  db: Db,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(userVerifications)
    .where(eq(userVerifications.userId, userId))
    .limit(1);
  return rows.length > 0;
}

// The fields a user can change from /settings. Both optional so a partial
// update touches only what was sent; an undefined field is left as-is.
//   - displayName: the public name on attributed reports / their profile.
//     An empty string is normalized to null (no display name → falls back to
//     the username on the profile). Trimmed.
//   - defaultDisplayAttribution: the starting attribution for new submissions.
export interface UserSettingsUpdate {
  displayName?: string | null;
  defaultDisplayAttribution?: User["defaultDisplayAttribution"];
}

// Apply a settings update for one user. Ownership is the caller's concern (it
// passes its own internal id); this is pure persistence. Returns the updated
// row, or null if no such user (shouldn't happen for a signed-in caller, but
// keeps the function honest rather than silently succeeding). A no-field update
// is a harmless no-op read-back.
export async function updateUserSettings(
  db: Db,
  userId: string,
  update: UserSettingsUpdate,
): Promise<User | null> {
  const set: Partial<typeof users.$inferInsert> = {};
  if (update.displayName !== undefined) {
    const trimmed = update.displayName?.trim() ?? "";
    set.displayName = trimmed.length > 0 ? trimmed : null;
  }
  if (update.defaultDisplayAttribution !== undefined) {
    set.defaultDisplayAttribution = update.defaultDisplayAttribution;
  }
  if (Object.keys(set).length === 0) {
    return getUserById(db, userId);
  }
  const rows = await db
    .update(users)
    .set(set)
    .where(eq(users.id, userId))
    .returning();
  return rows[0] ?? null;
}

export interface DeleteUserAccountResult {
  // Reports soft-deleted as part of this account deletion (0 if the user had
  // none active, or if the account was already deleted).
  reportsDeleted: number;
  // True if the account was already soft-deleted — the call was a no-op. Lets
  // the caller distinguish "we just deleted you" from "you were already gone".
  alreadyDeleted: boolean;
  // False only when no such user row exists.
  found: boolean;
}

// Soft-delete a whole account in one transaction:
//   1. Soft-delete every one of the user's still-active reports (status →
//      'deleted', stamp deleted_at) and emit a 'deleted' event per report so
//      their cells re-aggregate and their search docs drop — the public
//      content disappears immediately, and the existing 90-day report PII sweep
//      will scrub the free text.
//   2. Stamp users.deleted_at.
// Drafts CASCADE-delete is NOT triggered here (the user row survives — the
// report FK is ON DELETE RESTRICT), so drafts are cleared explicitly: they're
// throwaway scratch with no audit value.
// Idempotent: a second call on an already-deleted account is a no-op
// (alreadyDeleted=true). The user's PII (email, handle, name, clerk id) is left
// intact for now; the worker's 90-day sweep (purgeDeletedUserPii) scrubs it,
// mirroring the report-PII retention window so an appeal/audit window exists.
export async function deleteUserAccount(
  db: Db,
  userId: string,
): Promise<DeleteUserAccountResult> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!existing[0]) {
      return { reportsDeleted: 0, alreadyDeleted: false, found: false };
    }
    if (existing[0].deletedAt) {
      return { reportsDeleted: 0, alreadyDeleted: true, found: true };
    }

    const now = new Date();
    const deletedReports = await tx
      .update(interviewReports)
      .set({ status: "deleted", deletedAt: now })
      .where(
        and(
          eq(interviewReports.createdByUserId, userId),
          ne(interviewReports.status, "deleted"),
        ),
      )
      .returning({
        id: interviewReports.id,
        companyId: interviewReports.companyId,
        canonicalRoleId: interviewReports.canonicalRoleId,
        level: interviewReports.level,
      });

    for (const r of deletedReports) {
      await emitReportEvent(tx, {
        op: "deleted",
        reportId: r.id,
        companyId: r.companyId,
        canonicalRoleId: r.canonicalRoleId,
        level: r.level,
      });
    }

    // Throwaway scratch — drop the in-progress drafts outright.
    await tx.delete(drafts).where(eq(drafts.userId, userId));

    await tx.update(users).set({ deletedAt: now }).where(eq(users.id, userId));

    return {
      reportsDeleted: deletedReports.length,
      alreadyDeleted: false,
      found: true,
    };
  });
}

// 90-day PII purge for soft-deleted accounts — the user-row analogue of
// purgeDeletedReportPii. Finds accounts soft-deleted before `before` (caller
// passes now - PII_RETENTION_MS) that haven't been purged yet, then nulls the
// identifying columns: email, username, display_name, clerk_id. The row itself
// stays (the report FK is ON DELETE RESTRICT and the row anchors the audit
// trail), but nothing personally identifying remains on it. Clearing clerk_id /
// username also frees their unique indexes. Stamps pii_purged_at so a re-run
// skips already-scrubbed rows. Idempotent; run by the worker's daily cron.
// Returns how many accounts were scrubbed this pass.
export async function purgeDeletedUserPii(
  db: Db,
  before: Date,
): Promise<{ usersPurged: number }> {
  const rows = await db
    .update(users)
    .set({
      email: null,
      username: null,
      displayName: null,
      clerkId: null,
      piiPurgedAt: new Date(),
    })
    .where(
      and(
        isNull(users.piiPurgedAt),
        lt(users.deletedAt, before),
      ),
    )
    .returning({ id: users.id });
  return { usersPurged: rows.length };
}

// The retention window before a deleted account's PII is scrubbed. Aliased to
// the report window so both sweeps share one figure.
export const USER_PII_RETENTION_MS = PII_RETENTION_MS;

// "Export my data" — the full JSON dump /api/export returns. Plain serializable
// shapes (no Drizzle row types leak out); dates are ISO strings so the file is
// stable JSON. Covers every surface the user authored plus their account +
// verification status, satisfying the Sprint 5 export exit criterion. Includes
// pending and soft-deleted reports (it's the user's own data, not a public
// read) so the dump is complete; redacted PII (post-purge) simply exports as
// the scrubbed value.
export interface UserDataExport {
  exportedAt: string;
  account: {
    id: string;
    username: string | null;
    displayName: string | null;
    email: string | null;
    defaultDisplayAttribution: User["defaultDisplayAttribution"];
    createdAt: string;
    deletedAt: string | null;
  };
  reports: Array<{
    id: string;
    company: string;
    role: string;
    level: string;
    // Nullable: a report can be submitted before an outcome is known.
    outcome: string | null;
    interviewMonth: string;
    displayAttribution: string;
    status: string;
    createdAt: string;
    rounds: Array<{
      roundType: string;
      rating: string;
      experienceProse: string | null;
      questions: Array<{ prose: string; topics: string[] }>;
    }>;
  }>;
  drafts: Array<{
    id: string;
    data: unknown;
    createdAt: string;
    updatedAt: string;
  }>;
  verifications: Array<{
    company: string;
    verifiedVia: string;
    verifiedAt: string;
  }>;
}

// Assemble the export dump for one user. Ownership is the caller's concern.
// Returns null if no such user (the route turns that into a 404). The report
// tree is read with the same flat-join → fold approach the edit read uses, but
// across ALL the user's reports at once rather than one report.
export async function getUserDataExport(
  db: Db,
  userId: string,
): Promise<UserDataExport | null> {
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user) return null;

  // Report heads (every status — this is the owner's own data).
  const reportRows = await db
    .select({
      id: interviewReports.id,
      company: companies.name,
      role: roles.name,
      level: interviewReports.level,
      outcome: interviewReports.outcome,
      interviewMonth: interviewReports.interviewMonth,
      displayAttribution: interviewReports.displayAttribution,
      status: interviewReports.status,
      createdAt: interviewReports.createdAt,
    })
    .from(interviewReports)
    .innerJoin(companies, eq(companies.id, interviewReports.companyId))
    .innerJoin(roles, eq(roles.id, interviewReports.canonicalRoleId))
    .where(eq(interviewReports.createdByUserId, userId))
    .orderBy(asc(interviewReports.createdAt));

  const reportIds = reportRows.map((r) => r.id);

  // Rounds for those reports, declared order.
  const roundRows = reportIds.length
    ? await db
        .select({
          id: rounds.id,
          reportId: rounds.reportId,
          orderIndex: rounds.orderIndex,
          roundType: rounds.roundType,
          rating: rounds.rating,
          experienceProse: rounds.experienceProse,
        })
        .from(rounds)
        .where(inArray(rounds.reportId, reportIds))
        .orderBy(asc(rounds.reportId), asc(rounds.orderIndex))
    : [];

  const roundIds = roundRows.map((r) => r.id);

  // Questions (with topics) for those rounds, declared order.
  const questionRows = roundIds.length
    ? await db
        .select({
          roundId: questions.roundId,
          orderIndex: questions.orderIndex,
          prose: questions.questionProse,
          topicName: topics.name,
        })
        .from(questions)
        .leftJoin(questionTopics, eq(questionTopics.questionId, questions.id))
        .leftJoin(topics, eq(topics.id, questionTopics.topicId))
        .where(inArray(questions.roundId, roundIds))
        .orderBy(asc(questions.roundId), asc(questions.orderIndex))
    : [];

  // Fold questions → topics[] keyed on (roundId, orderIndex).
  type ExportQuestion = { prose: string; topics: string[] };
  const questionsByRound = new Map<string, ExportQuestion[]>();
  const seenQuestion = new Map<string, ExportQuestion>();
  for (const row of questionRows) {
    const key = `${row.roundId}:${row.orderIndex}`;
    let q = seenQuestion.get(key);
    if (!q) {
      q = { prose: row.prose, topics: [] };
      seenQuestion.set(key, q);
      const list = questionsByRound.get(row.roundId) ?? [];
      list.push(q);
      questionsByRound.set(row.roundId, list);
    }
    if (row.topicName) q.topics.push(row.topicName);
  }

  // Rounds → their reports.
  const roundsByReport = new Map<string, UserDataExport["reports"][number]["rounds"]>();
  for (const r of roundRows) {
    const list = roundsByReport.get(r.reportId) ?? [];
    list.push({
      roundType: r.roundType,
      rating: r.rating,
      experienceProse: r.experienceProse,
      questions: questionsByRound.get(r.id) ?? [],
    });
    roundsByReport.set(r.reportId, list);
  }

  const draftRows = await db
    .select()
    .from(drafts)
    .where(eq(drafts.userId, userId))
    .orderBy(asc(drafts.createdAt));

  const verificationRows = await db
    .select({
      company: companies.name,
      verifiedVia: userVerifications.verifiedVia,
      verifiedAt: userVerifications.verifiedAt,
    })
    .from(userVerifications)
    .innerJoin(companies, eq(companies.id, userVerifications.companyId))
    .where(eq(userVerifications.userId, userId))
    .orderBy(asc(userVerifications.verifiedAt));

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      defaultDisplayAttribution: user.defaultDisplayAttribution,
      createdAt: user.createdAt.toISOString(),
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
    },
    reports: reportRows.map((r) => ({
      id: r.id,
      company: r.company,
      role: r.role,
      level: r.level,
      outcome: r.outcome,
      interviewMonth: r.interviewMonth,
      displayAttribution: r.displayAttribution,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      rounds: roundsByReport.get(r.id) ?? [],
    })),
    drafts: draftRows.map((d) => ({
      id: d.id,
      data: d.data,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
    verifications: verificationRows.map((v) => ({
      company: v.company,
      verifiedVia: v.verifiedVia,
      verifiedAt: v.verifiedAt.toISOString(),
    })),
  };
}
