// Creates any missing Typesense collections from the committed schemas.
// Idempotent (never auto-drops). Called by the provision script + the worker on boot.

import { getSearchClient } from "./client.js";
import { ALL_COLLECTIONS } from "./schemas/index.js";
import type { Client } from "typesense";

export type ProvisionAction = "created" | "exists";

export interface ProvisionResult {
  collection: string;
  action: ProvisionAction;
}

// Typesense throws httpStatus 409 when the collection already exists.
function isAlreadyExists(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "httpStatus" in err &&
    (err as { httpStatus?: number }).httpStatus === 409
  );
}

export async function ensureCollections(
  client: Client = getSearchClient(),
): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];
  for (const schema of ALL_COLLECTIONS) {
    try {
      await client.collections().create(schema);
      results.push({ collection: schema.name, action: "created" });
    } catch (err) {
      if (isAlreadyExists(err)) {
        results.push({ collection: schema.name, action: "exists" });
        continue;
      }
      throw err;
    }
  }
  return results;
}

// Per-collection live doc counts — feeds /admin/health.
export async function collectionDocCounts(
  client: Client = getSearchClient(),
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const schema of ALL_COLLECTIONS) {
    try {
      const c = await client.collections(schema.name).retrieve();
      counts[schema.name] = c.num_documents ?? 0;
    } catch {
      counts[schema.name] = 0; // not provisioned yet
    }
  }
  return counts;
}
