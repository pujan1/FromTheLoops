import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";

// `companies` — powers company search (the submission autocomplete's heavier
// cousin and the Sprint 4 company directory). Full-text over name + aliases so
// "FB" finds Meta; report_count drives "most-covered first" ranking.
//
// Only status='active' companies are indexed (pending user-suggested rows stay
// out of search until a mod promotes them). id == the company uuid.
export const COMPANIES_COLLECTION = "companies";

export const companiesCollectionSchema: CollectionCreateSchema = {
  name: COMPANIES_COLLECTION,
  default_sorting_field: "report_count",
  fields: [
    { name: "name", type: "string" },
    { name: "slug", type: "string", facet: false },
    // Alternate names matched alongside name.
    { name: "aliases", type: "string[]", facet: false, optional: true },
    // How many live reports reference this company — ranking + "X experiences".
    { name: "report_count", type: "int32" },
  ],
};
