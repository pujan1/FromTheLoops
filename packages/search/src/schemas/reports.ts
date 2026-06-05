import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";

// `reports` — the primary search collection: full-text over interview prose
// plus every facet the Sprint 4 wedge/search UI filters on (company, role,
// level, round-type, tags, outcome, trust-tier).
//
// One doc = one *active, non-deleted* interview_report (same visibility filter
// as the aggregate pipeline — pending_moderation / deleted rows never get
// indexed; see indexers/reports.ts). The doc denormalises the company/role
// names + all child round-types and topic tags so a single Typesense query
// resolves a faceted result without touching Postgres.
//
// id == the report's uuid, so upsert/delete by report id is a primary-key op.
export const REPORTS_COLLECTION = "reports";

export const reportsCollectionSchema: CollectionCreateSchema = {
  name: REPORTS_COLLECTION,
  // Newest-first is the natural default ordering for "what just landed".
  default_sorting_field: "created_at",
  fields: [
    // Free-text body: question prose + round experience prose, concatenated.
    { name: "text", type: "string" },

    // Company facet + display.
    { name: "company_id", type: "string", facet: true },
    { name: "company_slug", type: "string", facet: false },
    { name: "company_name", type: "string", facet: true },

    // Role facet + display.
    { name: "role_id", type: "string", facet: true },
    { name: "role_slug", type: "string", facet: false },
    { name: "role_name", type: "string", facet: true },

    // Per-company level (text — the wedge cell's third axis).
    { name: "level", type: "string", facet: true },

    // Outcome is nullable on a report (pending interviews have none).
    { name: "outcome", type: "string", facet: true, optional: true },

    // Round-type facet — the set of round_types across the report's rounds.
    { name: "round_types", type: "string[]", facet: true },

    // Topic-tag facets — ids for exact filtering, names for human-readable
    // facet labels, slugs for /topics deep-links.
    { name: "topic_ids", type: "string[]", facet: true },
    { name: "topic_slugs", type: "string[]", facet: true },
    { name: "topic_names", type: "string[]", facet: true },

    // Trust tier — the PLAN.md aggregation-weighting dimension surfaced as a
    // filter ("verified" | "unverified"); evidence_verified is the raw bool.
    { name: "trust_tier", type: "string", facet: true },
    { name: "evidence_verified", type: "bool", facet: true },

    // "YYYY-MM" the interview happened — facet + lexical range filtering.
    { name: "interview_month", type: "string", facet: true },

    // Unix seconds, for default newest-first sort.
    { name: "created_at", type: "int64" },
  ],
};
