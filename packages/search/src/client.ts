// Typed Typesense client wrapper (Sprint 3 deliverable: packages/search client).
//
// Source of truth is Postgres (@fromtheloop/db); Typesense is a query-shape
// projection. This module owns the *only* place we construct a Typesense client
// so connection config + the module-level singleton live in one spot — same
// shape as getDb() in @fromtheloop/db.
//
// Both the Hetzner worker (indexer, Day 6) and apps/web (faceted query reads,
// Sprint 4) import getSearchClient() from here.

import Typesense from "typesense";
import type { Client } from "typesense";
import { readTypesenseConfig, type TypesenseConfig } from "./env.js";

let cached: Client | null = null;

// Module-level singleton. Long-lived processes (worker) reuse one client; the
// Next.js dev server reuses across HMR reloads in the same Node process.
export function getSearchClient(config?: TypesenseConfig): Client {
  if (cached && !config) return cached;
  const cfg = config ?? readTypesenseConfig();
  const client = new Typesense.Client({
    nodes: [{ host: cfg.host, port: cfg.port, protocol: cfg.protocol }],
    apiKey: cfg.apiKey,
    // The worker fans out N concurrent jobs; a short timeout keeps a stalled
    // Typesense from wedging a job for minutes (BullMQ retries the failure).
    connectionTimeoutSeconds: 5,
    // Indexers tolerate transient blips; let the client retry briefly before
    // surfacing the error to BullMQ's own attempts/backoff.
    numRetries: 2,
    retryIntervalSeconds: 1,
  });
  if (!config) cached = client;
  return client;
}

// Reset the singleton — tests that point at a throwaway Typesense use this.
export function resetSearchClient(): void {
  cached = null;
}
