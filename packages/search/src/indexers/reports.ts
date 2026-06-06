// reports indexer — maps a db ReportIndexInput onto a Typesense `reports` doc
// and pushes/removes it. The db layer owns the read + visibility filter; this
// owns the Typesense doc shape (kept in lockstep with schemas/reports.ts).

import type { Client } from "typesense";
import type { ReportIndexInput } from "@fromtheloop/db";
import { REPORTS_COLLECTION } from "../schemas/reports.js";

// The on-disk doc shape. Field names == schemas/reports.ts.
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
    // Omit the field entirely when null — the schema marks outcome optional;
    // a pending interview simply carries no outcome facet.
    ...(input.outcome ? { outcome: input.outcome } : {}),
    round_types: input.roundTypes,
    round_count: input.roundCount,
    topic_ids: input.topics.map((t) => t.id),
    topic_slugs: input.topics.map((t) => t.slug),
    topic_names: input.topics.map((t) => t.name),
    trust_tier: input.evidenceVerified ? "verified" : "unverified",
    evidence_verified: input.evidenceVerified,
    interview_month: input.interviewMonth,
    // Typesense int64 — unix seconds.
    created_at: Math.floor(input.createdAt.getTime() / 1000),
  };
}

// Upsert (create-or-replace by id). Idempotent — re-indexing the same report is
// a no-op-equivalent overwrite, so a BullMQ retry is safe.
export async function upsertReportDoc(
  client: Client,
  doc: ReportDoc,
): Promise<void> {
  await client
    .collections(REPORTS_COLLECTION)
    .documents()
    .upsert(doc);
}

// Batched upsert for the backfill — one import call per chunk instead of N
// round-trips. Throws if any doc in the batch fails.
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

// Delete by id, tolerant of "already gone" (404). Used for delete events and
// for a report that's no longer visible (pending/soft-deleted).
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
