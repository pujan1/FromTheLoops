// All Typesense collection schemas; the provisioner reads ALL_COLLECTIONS.

import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";
import { reportsCollectionSchema } from "./reports.js";
import { companiesCollectionSchema } from "./companies.js";
import { topicsCollectionSchema } from "./topics.js";

export * from "./reports.js";
export * from "./companies.js";
export * from "./topics.js";

export const ALL_COLLECTIONS: CollectionCreateSchema[] = [
  reportsCollectionSchema,
  companiesCollectionSchema,
  topicsCollectionSchema,
];
