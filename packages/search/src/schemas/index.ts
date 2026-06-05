// All Typesense collection schemas, committed to the repo (Sprint 3 deliverable:
// "Typesense schema files committed"). The provisioner (provision.ts) reads
// ALL_COLLECTIONS to create whatever's missing, idempotently.

import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";
import { reportsCollectionSchema } from "./reports.js";
import { companiesCollectionSchema } from "./companies.js";
import { topicsCollectionSchema } from "./topics.js";

export * from "./reports.js";
export * from "./companies.js";
export * from "./topics.js";

// Order is irrelevant — collections are independent — but keep reports first;
// it's the one that matters most.
export const ALL_COLLECTIONS: CollectionCreateSchema[] = [
  reportsCollectionSchema,
  companiesCollectionSchema,
  topicsCollectionSchema,
];
