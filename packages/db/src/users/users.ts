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

// Idempotent on clerk_id; refreshes email on repeat visits.
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

  // Fallback for the theoretical empty-returning case.
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

export async function getUserById(db: Db, id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

// Drives the /u/[username] profile resolve; null → 404.
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

// Header stats for the public profile. publicReportCount counts only visible
// attributed reports (anonymous ones stay invisible here).
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

// Holds at least one user_verifications row. Gates helpful-flag casting.
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

// Both optional → partial update; undefined fields left as-is.
export interface UserSettingsUpdate {
  displayName?: string | null;
  defaultDisplayAttribution?: User["defaultDisplayAttribution"];
}

// Empty displayName is normalized to null. Returns null if no such user.
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
  reportsDeleted: number;
  alreadyDeleted: boolean;
  found: boolean;
}

// Soft-deletes the account + its active reports (emitting 'deleted' events) and
// drops drafts, in one tx. Idempotent. PII scrubbed later by purgeDeletedUserPii.
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

// Nulls identifying columns on accounts soft-deleted before `before`. Stamps
// pii_purged_at so re-runs skip scrubbed rows. Idempotent (worker daily cron).
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

export const USER_PII_RETENTION_MS = PII_RETENTION_MS;

// The /api/export JSON dump: plain serializable shapes, ISO-string dates.
// Includes pending + soft-deleted reports (it's the user's own data).
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

// Returns null if no such user. Flat-join → fold across all the user's reports.
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
