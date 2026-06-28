import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";

// Topic search, full-text over name + aliases. Active rows only; id == the topic uuid.
export const TOPICS_COLLECTION = "topics";

export const topicsCollectionSchema: CollectionCreateSchema = {
  name: TOPICS_COLLECTION,
  default_sorting_field: "question_count",
  fields: [
    { name: "name", type: "string" },
    { name: "slug", type: "string", facet: false },
    { name: "aliases", type: "string[]", facet: false, optional: true },
    { name: "question_count", type: "int32" }, // ranking
  ],
};
