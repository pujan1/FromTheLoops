// Flat report projection for the Typesense indexer. Only status='active' AND
// deleted_at IS NULL reports are indexable; anything else returns null (the
// indexer drops the stale doc). Hands back a plain shape, no @fromtheloop/search dep.

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  companies,
  interviewReports,
  questions,
  questionTopics,
  roles,
  rounds,
  topics,
} from "../schema/index.js";
import type { Db } from "../lib/types.js";

export interface ReportIndexTopic {
  id: string;
  slug: string;
  name: string;
}

export interface ReportIndexInput {
  id: string;
  company: { id: string; slug: string; name: string };
  role: { id: string; slug: string; name: string };
  level: string;
  outcome: string | null;
  evidenceVerified: boolean;
  interviewMonth: string;
  createdAt: Date;
  roundTypes: string[];
  roundCount: number;
  topics: ReportIndexTopic[];
  text: string; // every round + question prose, concatenated; the full-text field
}

// null if the report doesn't exist or isn't publicly visible.
export async function getReportForIndex(
  db: Db,
  reportId: string,
): Promise<ReportIndexInput | null> {
  const headRows = await db
    .select({
      report: interviewReports,
      companyId: companies.id,
      companySlug: companies.slug,
      companyName: companies.name,
      roleId: roles.id,
      roleSlug: roles.slug,
      roleName: roles.name,
    })
    .from(interviewReports)
    .innerJoin(companies, eq(companies.id, interviewReports.companyId))
    .innerJoin(roles, eq(roles.id, interviewReports.canonicalRoleId))
    .where(
      and(
        eq(interviewReports.id, reportId),
        eq(interviewReports.status, "active"),
        isNull(interviewReports.deletedAt),
      ),
    )
    .limit(1);
  const head = headRows[0];
  if (!head) return null;

  const roundRows = await db
    .select({
      roundType: rounds.roundType,
      experienceProse: rounds.experienceProse,
    })
    .from(rounds)
    .where(eq(rounds.reportId, reportId))
    .orderBy(asc(rounds.orderIndex));

  const questionRows = await db
    .select({
      prose: questions.questionProse,
      topicId: topics.id,
      topicSlug: topics.slug,
      topicName: topics.name,
    })
    .from(questions)
    .innerJoin(rounds, eq(rounds.id, questions.roundId))
    .leftJoin(questionTopics, eq(questionTopics.questionId, questions.id))
    .leftJoin(topics, eq(topics.id, questionTopics.topicId))
    .where(eq(rounds.reportId, reportId))
    .orderBy(asc(questions.roundId), asc(questions.orderIndex));

  const roundTypes = [...new Set(roundRows.map((r) => r.roundType))];

  const topicsById = new Map<string, ReportIndexTopic>();
  const textParts: string[] = [];
  for (const r of roundRows) {
    if (r.experienceProse) textParts.push(r.experienceProse);
  }
  const seenProse = new Set<string>();
  for (const row of questionRows) {
    // The topic join fans out one row per topic; dedupe prose so it isn't repeated.
    if (!seenProse.has(row.prose)) {
      seenProse.add(row.prose);
      textParts.push(row.prose);
    }
    if (row.topicId && row.topicSlug && row.topicName) {
      topicsById.set(row.topicId, {
        id: row.topicId,
        slug: row.topicSlug,
        name: row.topicName,
      });
    }
  }

  return {
    id: head.report.id,
    company: { id: head.companyId, slug: head.companySlug, name: head.companyName },
    role: { id: head.roleId, slug: head.roleSlug, name: head.roleName },
    level: head.report.level,
    outcome: head.report.outcome,
    evidenceVerified: head.report.evidenceVerified,
    interviewMonth: head.report.interviewMonth,
    createdAt: head.report.createdAt,
    roundTypes,
    roundCount: roundRows.length,
    topics: [...topicsById.values()],
    text: textParts.join("\n\n"),
  };
}

// Backfill source: every visible report's id, oldest first.
export async function listVisibleReportIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: interviewReports.id })
    .from(interviewReports)
    .where(
      and(
        eq(interviewReports.status, "active"),
        isNull(interviewReports.deletedAt),
      ),
    )
    .orderBy(asc(interviewReports.createdAt));
  return rows.map((r) => r.id);
}

// companies / topics backfill — not event-driven; repopulated wholesale. Counts
// are over visible reports only.
export interface CompanyIndexInput {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  reportCount: number;
}

export async function listActiveCompaniesForIndex(
  db: Db,
): Promise<CompanyIndexInput[]> {
  const rows = await db.execute<{
    id: string;
    slug: string;
    name: string;
    aliases: string[];
    report_count: number;
  }>(sql`
    SELECT c.id, c.slug, c.name, c.aliases,
           count(r.id) FILTER (
             WHERE r.status = 'active' AND r.deleted_at IS NULL
           )::int AS report_count
    FROM companies c
    LEFT JOIN interview_reports r ON r.company_id = c.id
    WHERE c.status = 'active'
    GROUP BY c.id, c.slug, c.name, c.aliases
  `);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    aliases: row.aliases ?? [],
    reportCount: Number(row.report_count),
  }));
}

export interface TopicIndexInput {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  questionCount: number;
}

export async function listActiveTopicsForIndex(
  db: Db,
): Promise<TopicIndexInput[]> {
  const rows = await db.execute<{
    id: string;
    slug: string;
    name: string;
    aliases: string[];
    question_count: number;
  }>(sql`
    SELECT t.id, t.slug, t.name, t.aliases,
           count(DISTINCT q.id) FILTER (
             WHERE r.status = 'active' AND r.deleted_at IS NULL
           )::int AS question_count
    FROM topics t
    LEFT JOIN question_topics qt ON qt.topic_id = t.id
    LEFT JOIN questions q ON q.id = qt.question_id
    LEFT JOIN rounds rd ON rd.id = q.round_id
    LEFT JOIN interview_reports r ON r.id = rd.report_id
    WHERE t.status = 'active'
    GROUP BY t.id, t.slug, t.name, t.aliases
  `);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    aliases: row.aliases ?? [],
    questionCount: Number(row.question_count),
  }));
}
