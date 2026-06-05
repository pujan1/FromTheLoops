// @fromtheloop/search — typed Typesense client + collection schemas + indexers.
// Source of truth is Postgres (@fromtheloop/db); this package is the query-shape
// projection. See README.md.

// Connection config + the client singleton.
export * from "./env.js";
export * from "./client.js";

// Committed collection schemas + collection-name constants.
export * from "./schemas/index.js";

// Provisioning (create-if-missing) + doc-count introspection.
export * from "./provision.js";

// Document builders + indexers (the worker's index-typesense job + backfill).
export * from "./indexers/index.js";
