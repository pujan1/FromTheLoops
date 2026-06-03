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
import { companies, companyLevels, roles, topics } from "../schema/index.js";
import { slugify } from "../slug.js";

// Minimal DB type: a Drizzle postgres-js client bound to our schema. Both
// getDb()'s client and the test client (helpers.ts `TestDb`) satisfy this —
// they differ only in the optional `$client` field, which the seed never
// touches. Typing the param this loosely keeps seedCurated() callable from
// tests without dragging in the production client's exact shape.
type Db = PostgresJsDatabase<typeof schema>;

export interface CuratedCompany {
  slug: string;
  name: string;
  domain: string;
  aliases?: string[];
  // Ladder, low → high. Order is preserved as company_levels.order_index
  // since level names don't sort lexically (L3 < L4 < L5, E3 < E4 …).
  levels: string[];
}

export interface CuratedRole {
  slug: string;
  name: string;
  aliases?: string[];
}

export interface CuratedTopic {
  slug: string;
  name: string;
  aliases?: string[];
}

// Level slugs are derived from the display name via the shared slugify()
// (unique within a company, which is all the (company_id, slug) constraint
// requires).

// 30 companies. Ladders are the public/known IC engineering tracks; where a
// company is famously flat (Netflix) the ladder is short on purpose.
export const CURATED_COMPANIES: CuratedCompany[] = [
  { slug: "google", name: "Google", domain: "google.com", aliases: ["Alphabet"], levels: ["L3", "L4", "L5", "L6", "L7"] },
  { slug: "meta", name: "Meta", domain: "meta.com", aliases: ["Facebook"], levels: ["E3", "E4", "E5", "E6", "E7"] },
  { slug: "amazon", name: "Amazon", domain: "amazon.com", aliases: ["AWS", "Amazon Web Services"], levels: ["SDE I", "SDE II", "SDE III", "Principal"] },
  { slug: "apple", name: "Apple", domain: "apple.com", levels: ["ICT2", "ICT3", "ICT4", "ICT5", "ICT6"] },
  { slug: "microsoft", name: "Microsoft", domain: "microsoft.com", aliases: ["MSFT"], levels: ["SDE (59-60)", "SDE II (61-62)", "Senior (63-64)", "Principal (65-67)"] },
  { slug: "netflix", name: "Netflix", domain: "netflix.com", levels: ["Senior", "Principal"] },
  { slug: "stripe", name: "Stripe", domain: "stripe.com", levels: ["L1", "L2", "L3", "L4", "L5"] },
  { slug: "uber", name: "Uber", domain: "uber.com", levels: ["3", "4", "5a", "5b", "6"] },
  { slug: "airbnb", name: "Airbnb", domain: "airbnb.com", levels: ["G7", "G8", "G9", "G10"] },
  { slug: "linkedin", name: "LinkedIn", domain: "linkedin.com", levels: ["Associate", "Senior", "Staff", "Senior Staff", "Principal"] },
  { slug: "salesforce", name: "Salesforce", domain: "salesforce.com", levels: ["Associate MTS", "MTS", "Senior MTS", "Lead MTS", "Principal MTS"] },
  { slug: "oracle", name: "Oracle", domain: "oracle.com", levels: ["IC1", "IC2", "IC3", "IC4", "IC5"] },
  { slug: "nvidia", name: "Nvidia", domain: "nvidia.com", levels: ["IC1", "IC2", "IC3", "IC4", "IC5", "IC6"] },
  { slug: "adobe", name: "Adobe", domain: "adobe.com", levels: ["Eng 2", "Eng 3", "Senior", "Principal"] },
  { slug: "atlassian", name: "Atlassian", domain: "atlassian.com", levels: ["P3", "P4", "P5", "P6"] },
  { slug: "shopify", name: "Shopify", domain: "shopify.com", levels: ["Junior", "Intermediate", "Senior", "Staff", "Principal"] },
  { slug: "coinbase", name: "Coinbase", domain: "coinbase.com", levels: ["IC3", "IC4", "IC5", "IC6"] },
  { slug: "databricks", name: "Databricks", domain: "databricks.com", levels: ["L3", "L4", "L5", "L6"] },
  { slug: "snowflake", name: "Snowflake", domain: "snowflake.com", levels: ["IC2", "IC3", "IC4", "IC5"] },
  { slug: "palantir", name: "Palantir", domain: "palantir.com", levels: ["New Grad", "Engineer", "Senior", "Lead"] },
  { slug: "dropbox", name: "Dropbox", domain: "dropbox.com", levels: ["IC1", "IC2", "IC3", "IC4"] },
  { slug: "pinterest", name: "Pinterest", domain: "pinterest.com", levels: ["Eng 1", "Eng 2", "Senior", "Staff"] },
  { slug: "block", name: "Block", domain: "block.xyz", aliases: ["Square", "Cash App"], levels: ["L3", "L4", "L5", "L6"] },
  { slug: "doordash", name: "DoorDash", domain: "doordash.com", levels: ["E3", "E4", "E5", "E6"] },
  { slug: "lyft", name: "Lyft", domain: "lyft.com", levels: ["T3", "T4", "T5", "T6"] },
  { slug: "robinhood", name: "Robinhood", domain: "robinhood.com", levels: ["IC3", "IC4", "IC5", "IC6"] },
  { slug: "reddit", name: "Reddit", domain: "reddit.com", levels: ["IC3", "IC4", "IC5", "IC6"] },
  { slug: "twilio", name: "Twilio", domain: "twilio.com", levels: ["TM3", "TM4", "TM5", "TM6"] },
  { slug: "roblox", name: "Roblox", domain: "roblox.com", levels: ["ICT2", "ICT3", "ICT4", "ICT5"] },
  { slug: "openai", name: "OpenAI", domain: "openai.com", levels: ["IC3", "IC4", "IC5", "IC6"] },
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
// active tag required; PLAN.md §Data model). Spans the four families the
// wedge targets — general SWE (algorithms/DS + system design + language &
// backend fundamentals), ML, data, and SRE/DevOps — plus a small set of
// universal behavioral tags. Slugs are stable (topic page URL + the
// question_topics FK), so don't rename them; widen `aliases` instead.
// Aliases feed the same fuzzy match as companies/roles (so "DP" → Dynamic
// Programming, "K8s" → Kubernetes). Unlike roles, topics ALSO allow inline
// "suggest new → pending" via suggestTopic — this is just the curated floor.
export const CURATED_TOPICS: CuratedTopic[] = [
  // Algorithms & data structures (universal SWE)
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
  // System design (universal)
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
  // Language, web & backend fundamentals
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
  // Machine learning
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
  // Data engineering / analytics
  { slug: "data-modeling", name: "Data Modeling", aliases: ["Dimensional Modeling"] },
  { slug: "etl", name: "ETL", aliases: ["ELT"] },
  { slug: "data-pipelines", name: "Data Pipelines", aliases: ["Airflow"] },
  { slug: "data-warehousing", name: "Data Warehousing", aliases: ["Snowflake", "BigQuery"] },
  { slug: "spark", name: "Apache Spark", aliases: ["Spark", "PySpark"] },
  { slug: "stream-processing", name: "Stream Processing", aliases: ["Streaming", "Flink"] },
  { slug: "a-b-testing", name: "A/B Testing", aliases: ["Experimentation"] },
  // SRE / DevOps / infra
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
  // Behavioral (universal)
  { slug: "leadership", name: "Leadership" },
  { slug: "conflict-resolution", name: "Conflict Resolution" },
  { slug: "teamwork", name: "Teamwork", aliases: ["Collaboration"] },
  { slug: "ownership", name: "Ownership" },
  { slug: "dealing-with-ambiguity", name: "Dealing with Ambiguity" },
  { slug: "project-management", name: "Project Management" },
];

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
    return c.levels.map((name, orderIndex) => ({
      companyId,
      slug: slugify(name),
      name,
      orderIndex,
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
        status: "active" as const,
        source: "seed_curated" as const,
      })),
    )
    .onConflictDoUpdate({
      target: topics.slug,
      set: {
        name: sql`excluded.name`,
        aliases: sql`excluded.aliases`,
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
