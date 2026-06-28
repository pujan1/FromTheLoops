// Maps a db ReportIndexInput onto a Typesense `reports` doc (shape kept in
// lockstep with schemas/reports.ts) and pushes/removes it.

import type { Client } from "typesense";
import type { ReportIndexInput } from "@fromtheloop/db";
import { REPORTS_COLLECTION } from "../schemas/reports.js";

export interface ReportDoc {
  id: string;
  text: string;
  company_id: string;
  company_slug: string;
  company_name: string;
  role_id: string;
  role_slug: string;
  role_name: string;
  level: string;
  outcome?: string;
  round_types: string[];
  round_count: number;
  topic_ids: string[];
  topic_slugs: string[];
  topic_names: string[];
  trust_tier: "verified" | "unverified";
  evidence_verified: boolean;
  interview_month: string;
  created_at: number;
}

export function buildReportDoc(input: ReportIndexInput): ReportDoc {
  return {
    id: input.id,
    text: input.text,
    company_id: input.company.id,
    company_slug: input.company.slug,
    company_name: input.company.name,
    role_id: input.role.id,
    role_slug: input.role.slug,
    role_name: input.role.name,
    level: input.level,
    ...(input.outcome ? { outcome: input.outcome } : {}), // omit when null
    round_types: input.roundTypes,
    round_count: input.roundCount,
    topic_ids: input.topics.map((t) => t.id),
    topic_slugs: input.topics.map((t) => t.slug),
    topic_names: input.topics.map((t) => t.name),
    trust_tier: input.evidenceVerified ? "verified" : "unverified",
    evidence_verified: input.evidenceVerified,
    interview_month: input.interviewMonth,
    created_at: Math.floor(input.createdAt.getTime() / 1000), // unix seconds
  };
}

// Idempotent upsert by id.
export async function upsertReportDoc(
  client: Client,
  doc: ReportDoc,
): Promise<void> {
  await client
    .collections(REPORTS_COLLECTION)
    .documents()
    .upsert(doc);
}

// Batched upsert for the backfill. Throws if any doc fails.
export async function importReportDocs(
  client: Client,
  docs: ReportDoc[],
): Promise<number> {
  if (docs.length === 0) return 0;
  const results = await client
    .collections(REPORTS_COLLECTION)
    .documents()
    .import(docs, { action: "upsert" });
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    throw new Error(
      `[index] ${REPORTS_COLLECTION}: ${failures.length}/${docs.length} doc(s) failed — first: ${failures[0]?.error}`,
    );
  }
  return docs.length;
}

// Delete by id, tolerant of 404 (already gone / no longer visible).
export async function deleteReportDoc(
  client: Client,
  reportId: string,
): Promise<void> {
  try {
    await client.collections(REPORTS_COLLECTION).documents(reportId).delete();
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "httpStatus" in err &&
    (err as { httpStatus?: number }).httpStatus === 404
  );
}
