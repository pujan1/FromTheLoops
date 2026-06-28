import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";

// The primary search collection: full-text over interview prose + every wedge
// facet. One doc = one active, non-deleted report (denormalized so one query
// resolves a faceted result). id == the report's uuid.
export const REPORTS_COLLECTION = "reports";

export const reportsCollectionSchema: CollectionCreateSchema = {
  name: REPORTS_COLLECTION,
  default_sorting_field: "created_at",
  fields: [
    { name: "text", type: "string" }, // question + round prose, concatenated

    { name: "company_id", type: "string", facet: true },
    { name: "company_slug", type: "string", facet: false },
    { name: "company_name", type: "string", facet: true },

    { name: "role_id", type: "string", facet: true },
    { name: "role_slug", type: "string", facet: false },
    { name: "role_name", type: "string", facet: true },

    { name: "level", type: "string", facet: true },
    { name: "outcome", type: "string", facet: true, optional: true },

    { name: "round_types", type: "string[]", facet: true },
    { name: "round_count", type: "int32", optional: true },

    { name: "topic_ids", type: "string[]", facet: true },
    { name: "topic_slugs", type: "string[]", facet: true },
    { name: "topic_names", type: "string[]", facet: true },

    { name: "trust_tier", type: "string", facet: true },
    { name: "evidence_verified", type: "bool", facet: true },

    { name: "interview_month", type: "string", facet: true },
    { name: "created_at", type: "int64" }, // unix seconds
  ],
};
