import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";

// `topics` — backs the /topics index page (and topic autocomplete). Full-text
// over name + aliases; question_count ranks the most-asked-about tags first.
//
// Only status='active' topics are indexed (pending user-suggested tags stay out
// until promoted). id == the topic uuid.
export const TOPICS_COLLECTION = "topics";

export const topicsCollectionSchema: CollectionCreateSchema = {
  name: TOPICS_COLLECTION,
  default_sorting_field: "question_count",
  fields: [
    { name: "name", type: "string" },
    { name: "slug", type: "string", facet: false },
    { name: "aliases", type: "string[]", facet: false, optional: true },
    // How many live questions carry this tag — ranking + "X questions".
    { name: "question_count", type: "int32" },
  ],
};
