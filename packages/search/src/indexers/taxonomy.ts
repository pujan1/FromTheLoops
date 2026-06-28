// companies / topics indexers — doc mapping + bulk import (repopulated wholesale
// by the backfill, not event-driven).

import type { Client } from "typesense";
import type { CompanyIndexInput, TopicIndexInput } from "@fromtheloop/db";
import { COMPANIES_COLLECTION } from "../schemas/companies.js";
import { TOPICS_COLLECTION } from "../schemas/topics.js";

export interface CompanyDoc {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  report_count: number;
}

export interface TopicDoc {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  question_count: number;
}

export function buildCompanyDoc(input: CompanyIndexInput): CompanyDoc {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    aliases: input.aliases,
    report_count: input.reportCount,
  };
}

export function buildTopicDoc(input: TopicIndexInput): TopicDoc {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    aliases: input.aliases,
    question_count: input.questionCount,
  };
}

// Batched upsert; surfaces any per-doc failures.
async function importDocs(
  client: Client,
  collection: string,
  docs: object[],
): Promise<number> {
  if (docs.length === 0) return 0;
  const results = await client
    .collections(collection)
    .documents()
    .import(docs, { action: "upsert" });
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    throw new Error(
      `[index] ${collection}: ${failures.length}/${docs.length} doc(s) failed — first: ${failures[0]?.error}`,
    );
  }
  return docs.length;
}

export function importCompanyDocs(
  client: Client,
  docs: CompanyDoc[],
): Promise<number> {
  return importDocs(client, COMPANIES_COLLECTION, docs);
}

export function importTopicDocs(
  client: Client,
  docs: TopicDoc[],
): Promise<number> {
  return importDocs(client, TOPICS_COLLECTION, docs);
}
