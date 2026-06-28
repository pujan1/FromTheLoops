// The search consumer of the events outbox + the wholesale backfill (the
// Typesense mirror of refreshAggregateForEvent).

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

export type IndexEventResult = "missing" | "indexed" | "deleted";

// Per-event search handler — the core of the worker's index-typesense job. Idempotent.
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
    // created / updated — re-read under the visibility filter; null → drop stale doc.
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

// Backfill — repopulate Typesense from the DB. Collections must already exist.

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
