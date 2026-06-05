// Collection provisioning — create any missing Typesense collections from the
// committed schemas. Idempotent: a collection that already exists is left
// untouched (we never auto-drop/recreate — that would wipe the index; a schema
// change is a deliberate migration, out of V1 scope).
//
// Two call sites, both "provision in dev + Hetzner" (Sprint 3 Day 5):
//   - `pnpm --filter @fromtheloop/search provision` — one-shot, dev + manual.
//   - the worker calls ensureCollections() on boot (apps/worker) so the Hetzner
//     box self-provisions on deploy, same way it upserts its job schedulers.

import { getSearchClient } from "./client.js";
import { ALL_COLLECTIONS } from "./schemas/index.js";
import type { Client } from "typesense";

export type ProvisionAction = "created" | "exists";

export interface ProvisionResult {
  collection: string;
  action: ProvisionAction;
}

// Typesense throws a 409 with httpStatus 409 when the collection already exists.
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

// Per-collection live document counts — feeds /admin/health (Day 8) and the
// "is the index populated?" check after a backfill.
export async function collectionDocCounts(
  client: Client = getSearchClient(),
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const schema of ALL_COLLECTIONS) {
    try {
      const c = await client.collections(schema.name).retrieve();
      counts[schema.name] = c.num_documents ?? 0;
    } catch {
      // Collection not provisioned yet → report 0 rather than throwing, so the
      // health page degrades gracefully before first provision.
      counts[schema.name] = 0;
    }
  }
  return counts;
}
