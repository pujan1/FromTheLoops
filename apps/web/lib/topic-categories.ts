// Display labels + section order for the /topics index's category grouping
// (Sprint 5). The DB stores the stable category slug (topics.category, the
// topic_category enum); this is the one place those slugs become human section
// headings and a render order. Keyed on the enum so a new category value is a
// compile error here, not a silently-unlabeled section.

import type { Topic } from "@fromtheloop/db";

export type TopicCategory = NonNullable<Topic["category"]>;

// Render order of the index sections. Broadly narrowest-universal (algorithms,
// system design) → role-specific (ML, data, infra) → behavioral.
export const TOPIC_CATEGORY_ORDER: TopicCategory[] = [
  "algorithms",
  "system-design",
  "fundamentals",
  "machine-learning",
  "data-engineering",
  "infrastructure",
  "behavioral",
];

export const TOPIC_CATEGORY_LABEL: Record<TopicCategory, string> = {
  algorithms: "Algorithms & Data Structures",
  "system-design": "System Design",
  fundamentals: "Languages, Web & Backend",
  "machine-learning": "Machine Learning",
  "data-engineering": "Data Engineering & Analytics",
  infrastructure: "SRE, DevOps & Infra",
  behavioral: "Behavioral",
};

// Bucket heading for topics with no category — a promoted user-suggested tag a
// mod hasn't grouped yet. Rendered last, only when non-empty.
export const TOPIC_CATEGORY_OTHER_LABEL = "Other";
