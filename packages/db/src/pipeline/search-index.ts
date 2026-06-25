// Search-index read (Sprint 3 Day 6). The Typesense indexer (the worker's
// index-typesense job, via @fromtheloop/search) calls getReportForIndex to turn
// one report into the flat, denormalised shape a `reports` collection doc needs.
//
// Visibility filter — IDENTICAL to the aggregate pipeline's: only
// status='active' AND deleted_at IS NULL reports are indexable. Anything else
// returns null, which the indexer treats as "ensure no doc exists" (drop it).
// So a pending_moderation or soft-deleted report never leaks into search.
//
// Pure persistence, like reports.ts: no @fromtheloop/shared or /core dep, and
// crucially no @fromtheloop/search dep — the db layer hands back a plain shape;
// the search package owns the Typesense doc mapping.

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

// The flat projection of one report, ready for the search package to map onto a
// Typesense `reports` doc. Names denormalised so a faceted query needs no join.
export interface ReportIndexInput {
  id: string;
  company: { id: string; slug: string; name: string };
  role: { id: string; slug: string; name: string };
  level: string;
  outcome: string | null;
  evidenceVerified: boolean;
  interviewMonth: string;
  createdAt: Date;
  // Distinct round types across the report's rounds (facet).
  roundTypes: string[];
  // Total number of rounds (not deduped — the displayed "N rounds" count).
  roundCount: number;
  // Distinct topic tags across all the report's questions (facets).
  topics: ReportIndexTopic[];
  // Full-text body: every round's experience prose + every question's prose,
  // concatenated. This is the field free-text search runs over.
  text: string;
}

// Deep read of a single VISIBLE report, shaped for indexing. Returns null if
// the report doesn't exist or isn't publicly visible (pending/deleted) — the
// indexer then drops any stale doc.
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

  // Rounds in declared order — for round_types + experience prose.
  const roundRows = await db
    .select({
      roundType: rounds.roundType,
      experienceProse: rounds.experienceProse,
    })
    .from(rounds)
    .where(eq(rounds.reportId, reportId))
    .orderBy(asc(rounds.orderIndex));

  // Questions (joined to their topics) for the report's rounds — question prose
  // for the text body, topics for the facets.
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

  // Distinct round types, preserving first-seen order.
  const roundTypes = [...new Set(roundRows.map((r) => r.roundType))];

  // Distinct topics by id; collect the text body as we go.
  const topicsById = new Map<string, ReportIndexTopic>();
  const textParts: string[] = [];
  for (const r of roundRows) {
    if (r.experienceProse) textParts.push(r.experienceProse);
  }
  const seenProse = new Set<string>();
  for (const row of questionRows) {
    // The question/topic join fans out one row per topic; dedupe prose by a
    // running set so a 3-tag question doesn't triple its prose in the body.
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

// Backfill source: every VISIBLE report's id, oldest first. The Typesense
// backfill script (Day 6) streams these and indexes each. Kept as a thin id
// list so the caller controls fan-out / batching.
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

// ── companies / topics backfill ────────────────────────────────────────────
// These two collections aren't event-driven in V1 (the events outbox only
// carries report writes); the backfill script repopulates them wholesale, and a
// later reconciliation job (Sprint 6) keeps the counts fresh. report_count /
// question_count are computed over VISIBLE reports only, matching search's
// "what the public can see" contract.

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
