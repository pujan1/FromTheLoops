// The one place a Typesense client is constructed (singleton, like getDb()).
// Typesense is a query projection; Postgres is the source of truth.

import Typesense from "typesense";
import type { Client } from "typesense";
import { readTypesenseConfig, type TypesenseConfig } from "./env.js";

let cached: Client | null = null;

export function getSearchClient(config?: TypesenseConfig): Client {
  if (cached && !config) return cached;
  const cfg = config ?? readTypesenseConfig();
  const client = new Typesense.Client({
    nodes: [{ host: cfg.host, port: cfg.port, protocol: cfg.protocol }],
    apiKey: cfg.apiKey,
    connectionTimeoutSeconds: 5, // short, so a stalled Typesense doesn't wedge a job
    numRetries: 2,
    retryIntervalSeconds: 1,
  });
  if (!config) cached = client;
  return client;
}

export function resetSearchClient(): void {
  cached = null;
}
