// Async data pipeline: the internal event outbox (emit in report-write txns,
// drain in the worker), the per-(company,role,level) aggregate refresh + reads,
// the search-index projection sources, and the product-analytics sink.
export * from "./events.js";
export * from "./aggregates.js";
export * from "./search-index.js";
export * from "./analytics.js";
