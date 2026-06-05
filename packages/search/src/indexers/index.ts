// Indexer orchestration (Sprint 3 Day 6) — the search consumer of the events
// outbox, plus the wholesale backfill. The exact mirror of the aggregate
// consumer (refreshAggregateForEvent in @fromtheloop/db), but the write target
// is Typesense, so the event-driven core lives here in @fromtheloop/search
// (which deps on both db and the Typesense client).

import {
  getEventById,
  getReportForIndex,
  listActiveCompaniesForIndex,
  listActiveTopicsForIndex,
  listVisibleReportIds,
  markSearchEventProcessed,
  type Database,
} from "@fromtheloop/db";
import type { Client } from "typesense";
import { getSearchClient } from "../client.js";
import {
  buildReportDoc,
  deleteReportDoc,
  importReportDocs,
  upsertReportDoc,
  type ReportDoc,
} from "./reports.js";
import {
  buildCompanyDoc,
  buildTopicDoc,
  importCompanyDocs,
  importTopicDocs,
} from "./taxonomy.js";

export * from "./reports.js";
export * from "./taxonomy.js";

// "missing" — event id not found (already-gone / racing claim → no-op).
// "indexed" — the report's doc was upserted.
// "deleted" — the doc was removed (delete event, or the report is no longer
//             publicly visible: pending_moderation / soft-deleted).
export type IndexEventResult = "missing" | "indexed" | "deleted";

// Per-event search handler — the testable core of the worker's index-typesense
// job. Idempotent: a missing/already-drained event is a clean no-op, an upsert
// is a create-or-replace, and a delete tolerates "already gone", so BullMQ
// retries and the fallback poller can both deliver the same event safely.
export async function indexReportForEvent(
  db: Database,
  client: Client,
  eventId: string,
): Promise<IndexEventResult> {
  const event = await getEventById(db, eventId);
  if (!event) return "missing";

  let result: IndexEventResult;
  if (event.op === "deleted") {
    await deleteReportDoc(client, event.reportId);
    result = "deleted";
  } else {
    // created / updated — re-read under the visibility filter. A report that's
    // pending_moderation (or got soft-deleted between event + processing)
    // returns null, so we drop any stale doc rather than index a hidden report.
    const input = await getReportForIndex(db, event.reportId);
    if (!input) {
      await deleteReportDoc(client, event.reportId);
      result = "deleted";
    } else {
      await upsertReportDoc(client, buildReportDoc(input));
      result = "indexed";
    }
  }

  await markSearchEventProcessed(db, eventId);
  return result;
}

// ── backfill ────────────────────────────────────────────────────────────────
// Repopulate Typesense from the DB (Sprint 3 deliverable: `backfill:typesense`).
// Collections must already exist (ensureCollections) — the backfill script does
// that first. Returns per-collection counts.

export interface BackfillCounts {
  reports: number;
  companies: number;
  topics: number;
}

const REPORT_BATCH = 200;

export async function backfillReports(
  db: Database,
  client: Client,
): Promise<number> {
  const ids = await listVisibleReportIds(db);
  let indexed = 0;
  let batch: ReportDoc[] = [];
  for (const id of ids) {
    const input = await getReportForIndex(db, id);
    if (!input) continue; // raced a delete — skip
    batch.push(buildReportDoc(input));
    if (batch.length >= REPORT_BATCH) {
      indexed += await importReportDocs(client, batch);
      batch = [];
    }
  }
  indexed += await importReportDocs(client, batch);
  return indexed;
}

export async function backfillCompanies(
  db: Database,
  client: Client,
): Promise<number> {
  const companies = await listActiveCompaniesForIndex(db);
  return importCompanyDocs(client, companies.map(buildCompanyDoc));
}

export async function backfillTopics(
  db: Database,
  client: Client,
): Promise<number> {
  const topics = await listActiveTopicsForIndex(db);
  return importTopicDocs(client, topics.map(buildTopicDoc));
}

export async function backfillAll(
  db: Database,
  client: Client = getSearchClient(),
): Promise<BackfillCounts> {
  return {
    reports: await backfillReports(db, client),
    companies: await backfillCompanies(db, client),
    topics: await backfillTopics(db, client),
  };
}
