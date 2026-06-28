import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";

// Company search, full-text over name + aliases ("FB" finds Meta). Active rows
// only; id == the company uuid.
export const COMPANIES_COLLECTION = "companies";

export const companiesCollectionSchema: CollectionCreateSchema = {
  name: COMPANIES_COLLECTION,
  default_sorting_field: "report_count",
  fields: [
    { name: "name", type: "string" },
    { name: "slug", type: "string", facet: false },
    { name: "aliases", type: "string[]", facet: false, optional: true },
    { name: "report_count", type: "int32" }, // ranking
  ],
};
