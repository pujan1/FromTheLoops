// The curated taxonomy fixtures — 30 top tech companies (with per-company
// level ladders) and ~20 canonical engineering roles. Everything here is
// `source = 'seed_curated'`, `status = 'active'`, so it shows up in
// autocomplete immediately.
//
// Kept as plain exported arrays so tests + future tooling (mod queue, fixtures)
// can import the canonical set without a DB round-trip.
//
// Idempotent: seedCurated() upserts on the natural keys (company slug, role
// slug, company_id+level slug), so re-running refreshes edits in place
// without duplicating or erroring.

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";
import {
  companies,
  companyLevels,
  roles,
  topicCategory,
  topics,
} from "../schema/index.js";
import { slugify } from "../slug.js";

// Minimal DB type: a Drizzle postgres-js client bound to our schema. Both
// getDb()'s client and the test client (helpers.ts `TestDb`) satisfy this —
// they differ only in the optional `$client` field, which the seed never
// touches. Typing the param this loosely keeps seedCurated() callable from
// tests without dragging in the production client's exact shape.
type Db = PostgresJsDatabase<typeof schema>;

// Canonical seniority tier a rung maps to (mirrors the level_tier pgEnum).
// `null` = no standard tier → the submission UI renders the rung with no
// seniority prefix. `mid` is the baseline IC tier (also no prefix).
export type LevelTier =
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "senior_staff"
  | "principal";

// One ladder rung: display name + the tier it maps to. Tuple keeps the table
// below scannable: ["E5", "senior"].
export type LevelSpec = [name: string, tier: LevelTier | null];

export interface CuratedCompany {
  slug: string;
  name: string;
  domain: string;
  aliases?: string[];
  // Ladder, low → high. Order is preserved as company_levels.order_index
  // since level names don't sort lexically (L3 < L4 < L5, E3 < E4 …). Each
  // rung carries its canonical seniority tier for the submission UI relabel.
  levels: LevelSpec[];
}

export interface CuratedRole {
  slug: string;
  name: string;
  aliases?: string[];
}

// The curated category a topic belongs to (mirrors the topic_category pgEnum).
// Drives the /topics index's grouped sections; persisted on topics.category.
export type TopicCategory = (typeof topicCategory.enumValues)[number];

export interface CuratedTopic {
  slug: string;
  name: string;
  aliases?: string[];
  category: TopicCategory;
}

// Level slugs are derived from the display name via the shared slugify()
// (unique within a company, which is all the (company_id, slug) constraint
// requires).

// 30 companies. Ladders are the public/known IC engineering tracks; where a
// company is famously flat (Netflix) the ladder is short on purpose.
export const CURATED_COMPANIES: CuratedCompany[] = [
  { slug: "google", name: "Google", domain: "google.com", aliases: ["Alphabet"], levels: [["L3", "junior"], ["L4", "mid"], ["L5", "senior"], ["L6", "staff"], ["L7", "senior_staff"]] },
  { slug: "meta", name: "Meta", domain: "meta.com", aliases: ["Facebook"], levels: [["E3", "junior"], ["E4", "mid"], ["E5", "senior"], ["E6", "staff"], ["E7", "senior_staff"]] },
  { slug: "amazon", name: "Amazon", domain: "amazon.com", aliases: ["AWS", "Amazon Web Services"], levels: [["SDE I", "junior"], ["SDE II", "mid"], ["SDE III", "senior"], ["Principal", "principal"]] },
  { slug: "apple", name: "Apple", domain: "apple.com", levels: [["ICT2", "junior"], ["ICT3", "mid"], ["ICT4", "senior"], ["ICT5", "staff"], ["ICT6", "principal"]] },
  { slug: "microsoft", name: "Microsoft", domain: "microsoft.com", aliases: ["MSFT"], levels: [["SDE (59-60)", "junior"], ["SDE II (61-62)", "mid"], ["Senior (63-64)", "senior"], ["Principal (65-67)", "principal"]] },
  { slug: "netflix", name: "Netflix", domain: "netflix.com", levels: [["Senior", "senior"], ["Principal", "principal"]] },
  { slug: "stripe", name: "Stripe", domain: "stripe.com", levels: [["L1", "junior"], ["L2", "mid"], ["L3", "senior"], ["L4", "staff"], ["L5", "senior_staff"]] },
  { slug: "uber", name: "Uber", domain: "uber.com", levels: [["3", "junior"], ["4", "mid"], ["5a", "senior"], ["5b", "staff"], ["6", "senior_staff"]] },
  { slug: "airbnb", name: "Airbnb", domain: "airbnb.com", levels: [["G7", "junior"], ["G8", "mid"], ["G9", "senior"], ["G10", "staff"]] },
  { slug: "linkedin", name: "LinkedIn", domain: "linkedin.com", levels: [["Associate", "junior"], ["Senior", "senior"], ["Staff", "staff"], ["Senior Staff", "senior_staff"], ["Principal", "principal"]] },
  { slug: "salesforce", name: "Salesforce", domain: "salesforce.com", levels: [["Associate MTS", "junior"], ["MTS", "mid"], ["Senior MTS", "senior"], ["Lead MTS", "staff"], ["Principal MTS", "principal"]] },
  { slug: "oracle", name: "Oracle", domain: "oracle.com", levels: [["IC1", "junior"], ["IC2", "mid"], ["IC3", "senior"], ["IC4", "staff"], ["IC5", "principal"]] },
  { slug: "nvidia", name: "Nvidia", domain: "nvidia.com", levels: [["IC1", "junior"], ["IC2", "mid"], ["IC3", "senior"], ["IC4", "staff"], ["IC5", "senior_staff"], ["IC6", "principal"]] },
  { slug: "adobe", name: "Adobe", domain: "adobe.com", levels: [["Eng 2", "junior"], ["Eng 3", "mid"], ["Senior", "senior"], ["Principal", "principal"]] },
  { slug: "atlassian", name: "Atlassian", domain: "atlassian.com", levels: [["P3", "junior"], ["P4", "mid"], ["P5", "senior"], ["P6", "staff"]] },
  { slug: "shopify", name: "Shopify", domain: "shopify.com", levels: [["Junior", "junior"], ["Intermediate", "mid"], ["Senior", "senior"], ["Staff", "staff"], ["Principal", "principal"]] },
  { slug: "coinbase", name: "Coinbase", domain: "coinbase.com", levels: [["IC3", "junior"], ["IC4", "mid"], ["IC5", "senior"], ["IC6", "staff"]] },
  { slug: "databricks", name: "Databricks", domain: "databricks.com", levels: [["L3", "junior"], ["L4", "mid"], ["L5", "senior"], ["L6", "staff"]] },
  { slug: "snowflake", name: "Snowflake", domain: "snowflake.com", levels: [["IC2", "junior"], ["IC3", "mid"], ["IC4", "senior"], ["IC5", "staff"]] },
  { slug: "palantir", name: "Palantir", domain: "palantir.com", levels: [["New Grad", "junior"], ["Engineer", "mid"], ["Senior", "senior"], ["Lead", "staff"]] },
  { slug: "dropbox", name: "Dropbox", domain: "dropbox.com", levels: [["IC1", "junior"], ["IC2", "mid"], ["IC3", "senior"], ["IC4", "staff"]] },
  { slug: "pinterest", name: "Pinterest", domain: "pinterest.com", levels: [["Eng 1", "junior"], ["Eng 2", "mid"], ["Senior", "senior"], ["Staff", "staff"]] },
  { slug: "block", name: "Block", domain: "block.xyz", aliases: ["Square", "Cash App"], levels: [["L3", "junior"], ["L4", "mid"], ["L5", "senior"], ["L6", "staff"]] },
  { slug: "doordash", name: "DoorDash", domain: "doordash.com", levels: [["E3", "junior"], ["E4", "mid"], ["E5", "senior"], ["E6", "staff"]] },
  { slug: "lyft", name: "Lyft", domain: "lyft.com", levels: [["T3", "junior"], ["T4", "mid"], ["T5", "senior"], ["T6", "staff"]] },
  { slug: "robinhood", name: "Robinhood", domain: "robinhood.com", levels: [["IC3", "junior"], ["IC4", "mid"], ["IC5", "senior"], ["IC6", "staff"]] },
  { slug: "reddit", name: "Reddit", domain: "reddit.com", levels: [["IC3", "junior"], ["IC4", "mid"], ["IC5", "senior"], ["IC6", "staff"]] },
  { slug: "twilio", name: "Twilio", domain: "twilio.com", levels: [["TM3", "junior"], ["TM4", "mid"], ["TM5", "senior"], ["TM6", "staff"]] },
  { slug: "roblox", name: "Roblox", domain: "roblox.com", levels: [["ICT2", "junior"], ["ICT3", "mid"], ["ICT4", "senior"], ["ICT5", "staff"]] },
  { slug: "openai", name: "OpenAI", domain: "openai.com", levels: [["IC3", "junior"], ["IC4", "mid"], ["IC5", "senior"], ["IC6", "staff"]] },
];

// ~20 canonical engineering roles. Slugs are stable (URL + reports FK), so
// don't rename them; widen `aliases` instead. NO inline create for roles
// (PLAN.md §Taxonomy curation) — this set is the closed world users match.
export const CURATED_ROLES: CuratedRole[] = [
  { slug: "swe", name: "Software Engineer", aliases: ["SDE", "Software Development Engineer", "Programmer", "Software Developer"] },
  { slug: "frontend", name: "Frontend Engineer", aliases: ["Front-End Engineer", "UI Engineer", "Web Developer"] },
  { slug: "backend", name: "Backend Engineer", aliases: ["Back-End Engineer", "Server Engineer"] },
  { slug: "fullstack", name: "Full-Stack Engineer", aliases: ["Full Stack Engineer"] },
  { slug: "mobile", name: "Mobile Engineer", aliases: ["iOS Engineer", "Android Engineer", "Mobile Developer"] },
  { slug: "ml", name: "Machine Learning Engineer", aliases: ["ML Engineer", "MLE"] },
  { slug: "ai-engineer", name: "AI Engineer", aliases: ["LLM Engineer", "GenAI Engineer", "Applied AI Engineer"] },
  { slug: "data-engineer", name: "Data Engineer", aliases: ["DE"] },
  { slug: "data-scientist", name: "Data Scientist", aliases: ["DS"] },
  { slug: "data-analyst", name: "Data Analyst", aliases: ["Analytics Engineer"] },
  { slug: "research-scientist", name: "Research Scientist", aliases: ["Researcher", "Research Engineer"] },
  { slug: "sre", name: "Site Reliability Engineer", aliases: ["SRE", "Reliability Engineer"] },
  { slug: "devops", name: "DevOps Engineer", aliases: ["Cloud Engineer"] },
  { slug: "platform", name: "Platform Engineer", aliases: ["Infrastructure Engineer", "Infra Engineer"] },
  { slug: "security", name: "Security Engineer", aliases: ["AppSec Engineer", "InfoSec Engineer", "Product Security Engineer"] },
  { slug: "embedded", name: "Embedded Engineer", aliases: ["Firmware Engineer", "Embedded Systems Engineer"] },
  { slug: "qa", name: "QA Engineer", aliases: ["Test Engineer", "SDET", "Quality Engineer"] },
  { slug: "tech-lead", name: "Tech Lead", aliases: ["Technical Lead", "TL", "Lead Engineer"] },
  { slug: "eng-manager", name: "Engineering Manager", aliases: ["EM", "Software Engineering Manager"] },
  { slug: "product-manager", name: "Product Manager", aliases: ["PM", "Technical Product Manager", "TPM"] },
];

// ~85 curated topic tags — the seed set a question is tagged with (≥1
// active tag required; see docs/data-model.md). Spans the four families the
// wedge targets — general SWE (algorithms/DS + system design + language &
// backend fundamentals), ML, data, and SRE/DevOps — plus a small set of
// universal behavioral tags. Slugs are stable (topic page URL + the
// question_topics FK), so don't rename them; widen `aliases` instead.
// Aliases feed the same fuzzy match as companies/roles (so "DP" → Dynamic
// Programming, "K8s" → Kubernetes). Unlike roles, topics ALSO allow inline
// "suggest new → pending" via suggestTopic — this is just the curated floor.
// Topics, grouped by the curated category that drives the /topics index's
// sections (Sprint 5). Declaration order here = the section order on the index
// page (the flatten below preserves it). Category is persisted on
// topics.category; the index reads it back to render one section per group.
// Slugs are stable URLs — don't rename; widen `aliases` instead.
type SeedTopic = Omit<CuratedTopic, "category">;

const TOPICS_BY_CATEGORY: Record<TopicCategory, SeedTopic[]> = {
  // Algorithms & data structures (universal SWE)
  algorithms: [
    { slug: "arrays", name: "Arrays" },
    { slug: "strings", name: "Strings" },
    { slug: "hash-maps", name: "Hash Maps", aliases: ["Hash Tables", "Dictionaries"] },
    { slug: "linked-lists", name: "Linked Lists" },
    { slug: "stacks-and-queues", name: "Stacks & Queues" },
    { slug: "trees", name: "Trees" },
    { slug: "binary-trees", name: "Binary Trees" },
    { slug: "binary-search-trees", name: "Binary Search Trees", aliases: ["BST"] },
    { slug: "graphs", name: "Graphs" },
    { slug: "heaps", name: "Heaps", aliases: ["Priority Queues"] },
    { slug: "tries", name: "Tries", aliases: ["Prefix Trees"] },
    { slug: "dynamic-programming", name: "Dynamic Programming", aliases: ["DP", "Memoization"] },
    { slug: "greedy-algorithms", name: "Greedy Algorithms" },
    { slug: "recursion", name: "Recursion" },
    { slug: "backtracking", name: "Backtracking" },
    { slug: "sorting", name: "Sorting", aliases: ["Sorting Algorithms"] },
    { slug: "binary-search", name: "Binary Search" },
    { slug: "two-pointers", name: "Two Pointers" },
    { slug: "sliding-window", name: "Sliding Window" },
    { slug: "bit-manipulation", name: "Bit Manipulation" },
    { slug: "graph-traversal", name: "Graph Traversal", aliases: ["BFS", "DFS", "Breadth-First Search", "Depth-First Search"] },
    { slug: "union-find", name: "Union-Find", aliases: ["Disjoint Set"] },
    { slug: "intervals", name: "Intervals" },
    { slug: "matrix", name: "Matrix" },
  ],
  // System design (universal)
  "system-design": [
    { slug: "system-design", name: "System Design" },
    { slug: "scalability", name: "Scalability" },
    { slug: "load-balancing", name: "Load Balancing" },
    { slug: "caching", name: "Caching", aliases: ["Redis", "Memcached"] },
    { slug: "database-design", name: "Database Design", aliases: ["Schema Design"] },
    { slug: "sharding", name: "Sharding", aliases: ["Partitioning"] },
    { slug: "replication", name: "Replication" },
    { slug: "message-queues", name: "Message Queues", aliases: ["Kafka", "RabbitMQ"] },
    { slug: "microservices", name: "Microservices" },
    { slug: "api-design", name: "API Design", aliases: ["REST API Design"] },
    { slug: "rate-limiting", name: "Rate Limiting" },
    { slug: "consistent-hashing", name: "Consistent Hashing" },
    { slug: "distributed-systems", name: "Distributed Systems" },
    { slug: "cap-theorem", name: "CAP Theorem" },
    { slug: "pub-sub", name: "Pub/Sub", aliases: ["Publish-Subscribe"] },
    { slug: "idempotency", name: "Idempotency" },
  ],
  // Language, web & backend fundamentals
  fundamentals: [
    { slug: "concurrency", name: "Concurrency", aliases: ["Multithreading", "Parallelism"] },
    { slug: "transactions", name: "Transactions", aliases: ["ACID"] },
    { slug: "sql", name: "SQL" },
    { slug: "database-indexing", name: "Database Indexing" },
    { slug: "nosql", name: "NoSQL" },
    { slug: "operating-systems", name: "Operating Systems", aliases: ["OS"] },
    { slug: "networking", name: "Networking", aliases: ["TCP/IP", "HTTP"] },
    { slug: "object-oriented-design", name: "Object-Oriented Design", aliases: ["OOP", "OOD"] },
    { slug: "design-patterns", name: "Design Patterns" },
    { slug: "testing", name: "Testing", aliases: ["Unit Testing", "TDD"] },
    { slug: "javascript", name: "JavaScript", aliases: ["JS"] },
    { slug: "typescript", name: "TypeScript", aliases: ["TS"] },
    { slug: "react", name: "React" },
    { slug: "web-performance", name: "Web Performance" },
  ],
  // Machine learning
  "machine-learning": [
    { slug: "machine-learning", name: "Machine Learning", aliases: ["ML"] },
    { slug: "deep-learning", name: "Deep Learning" },
    { slug: "neural-networks", name: "Neural Networks" },
    { slug: "nlp", name: "Natural Language Processing", aliases: ["NLP"] },
    { slug: "computer-vision", name: "Computer Vision", aliases: ["CV"] },
    { slug: "transformers", name: "Transformers", aliases: ["Attention", "Self-Attention"] },
    { slug: "llms", name: "Large Language Models", aliases: ["LLM", "LLMs"] },
    { slug: "embeddings", name: "Embeddings", aliases: ["Vector Search"] },
    { slug: "recommendation-systems", name: "Recommendation Systems", aliases: ["RecSys"] },
    { slug: "feature-engineering", name: "Feature Engineering" },
    { slug: "model-evaluation", name: "Model Evaluation", aliases: ["Metrics", "Precision/Recall"] },
    { slug: "gradient-descent", name: "Gradient Descent", aliases: ["Backpropagation"] },
    { slug: "reinforcement-learning", name: "Reinforcement Learning", aliases: ["RL"] },
    { slug: "prompt-engineering", name: "Prompt Engineering" },
    { slug: "mlops", name: "MLOps" },
    { slug: "statistics", name: "Statistics", aliases: ["Probability"] },
  ],
  // Data engineering / analytics
  "data-engineering": [
    { slug: "data-modeling", name: "Data Modeling", aliases: ["Dimensional Modeling"] },
    { slug: "etl", name: "ETL", aliases: ["ELT"] },
    { slug: "data-pipelines", name: "Data Pipelines", aliases: ["Airflow"] },
    { slug: "data-warehousing", name: "Data Warehousing", aliases: ["Snowflake", "BigQuery"] },
    { slug: "spark", name: "Apache Spark", aliases: ["Spark", "PySpark"] },
    { slug: "stream-processing", name: "Stream Processing", aliases: ["Streaming", "Flink"] },
    { slug: "a-b-testing", name: "A/B Testing", aliases: ["Experimentation"] },
  ],
  // SRE / DevOps / infra
  infrastructure: [
    { slug: "kubernetes", name: "Kubernetes", aliases: ["K8s"] },
    { slug: "docker", name: "Docker", aliases: ["Containers"] },
    { slug: "ci-cd", name: "CI/CD" },
    { slug: "observability", name: "Observability", aliases: ["Monitoring", "Metrics & Tracing"] },
    { slug: "incident-response", name: "Incident Response", aliases: ["On-Call", "Postmortems"] },
    { slug: "infrastructure-as-code", name: "Infrastructure as Code", aliases: ["Terraform", "IaC"] },
    { slug: "linux", name: "Linux", aliases: ["Bash"] },
    { slug: "cloud-architecture", name: "Cloud Architecture", aliases: ["AWS", "GCP", "Azure"] },
    { slug: "sla-slo", name: "SLAs & SLOs", aliases: ["SLI", "Reliability"] },
    { slug: "capacity-planning", name: "Capacity Planning" },
  ],
  // Behavioral (universal)
  behavioral: [
    { slug: "leadership", name: "Leadership" },
    { slug: "conflict-resolution", name: "Conflict Resolution" },
    { slug: "teamwork", name: "Teamwork", aliases: ["Collaboration"] },
    { slug: "ownership", name: "Ownership" },
    { slug: "dealing-with-ambiguity", name: "Dealing with Ambiguity" },
    { slug: "project-management", name: "Project Management" },
  ],
};

// Flattened to the order categories are declared above — the canonical list the
// seed inserts and tests count. Each row carries its category for persistence.
export const CURATED_TOPICS: CuratedTopic[] = (
  Object.entries(TOPICS_BY_CATEGORY) as [TopicCategory, SeedTopic[]][]
).flatMap(([category, list]) => list.map((t) => ({ ...t, category })));

export interface SeedCuratedResult {
  companies: number;
  roles: number;
  levels: number;
  topics: number;
}

// Upsert the curated set. Returns counts (inserted-or-updated rows) so the
// seed entrypoint can log them and tests can assert on them.
export async function seedCurated(db: Db): Promise<SeedCuratedResult> {
  const companyRows = await db
    .insert(companies)
    .values(
      CURATED_COMPANIES.map((c) => ({
        slug: c.slug,
        name: c.name,
        domain: c.domain,
        aliases: c.aliases ?? [],
        status: "active" as const,
        source: "seed_curated" as const,
      })),
    )
    .onConflictDoUpdate({
      target: companies.slug,
      set: {
        name: sql`excluded.name`,
        domain: sql`excluded.domain`,
        aliases: sql`excluded.aliases`,
        status: sql`excluded.status`,
        source: sql`excluded.source`,
      },
    })
    .returning({ id: companies.id, slug: companies.slug });

  const idBySlug = new Map(companyRows.map((r) => [r.slug, r.id]));

  const levelValues = CURATED_COMPANIES.flatMap((c) => {
    const companyId = idBySlug.get(c.slug);
    if (!companyId) return [];
    return c.levels.map(([name, tier], orderIndex) => ({
      companyId,
      slug: slugify(name),
      name,
      orderIndex,
      tier,
      status: "active" as const,
      source: "seed_curated" as const,
    }));
  });

  const levelRows = levelValues.length
    ? await db
        .insert(companyLevels)
        .values(levelValues)
        .onConflictDoUpdate({
          target: [companyLevels.companyId, companyLevels.slug],
          set: {
            name: sql`excluded.name`,
            orderIndex: sql`excluded.order_index`,
            tier: sql`excluded.tier`,
            status: sql`excluded.status`,
            source: sql`excluded.source`,
          },
        })
        .returning({ id: companyLevels.id })
    : [];

  const roleRows = await db
    .insert(roles)
    .values(
      CURATED_ROLES.map((r) => ({
        slug: r.slug,
        name: r.name,
        aliases: r.aliases ?? [],
        status: "active" as const,
        source: "seed_curated" as const,
      })),
    )
    .onConflictDoUpdate({
      target: roles.slug,
      set: {
        name: sql`excluded.name`,
        aliases: sql`excluded.aliases`,
        status: sql`excluded.status`,
        source: sql`excluded.source`,
      },
    })
    .returning({ id: roles.id });

  const topicRows = await db
    .insert(topics)
    .values(
      CURATED_TOPICS.map((t) => ({
        slug: t.slug,
        name: t.name,
        aliases: t.aliases ?? [],
        category: t.category,
        status: "active" as const,
        source: "seed_curated" as const,
      })),
    )
    .onConflictDoUpdate({
      target: topics.slug,
      set: {
        name: sql`excluded.name`,
        aliases: sql`excluded.aliases`,
        category: sql`excluded.category`,
        status: sql`excluded.status`,
        source: sql`excluded.source`,
      },
    })
    .returning({ id: topics.id });

  return {
    companies: companyRows.length,
    roles: roleRows.length,
    levels: levelRows.length,
    topics: topicRows.length,
  };
}
