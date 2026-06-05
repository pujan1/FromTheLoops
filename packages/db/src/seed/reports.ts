// Dummy interview-report fixtures — the volume the Sprint 4 wedge page needs
// to render against. The curated seed (./curated.ts) only lays down taxonomy
// (companies / roles / levels / topics); nothing in V1 flips a *real* report to
// `active` yet (Sprint 2 moderation holds every user submission at
// `pending_moderation` until the Sprint 6 mod queue exists), and aggregates +
// search only ingest `active` rows — so without this the wedge page renders
// nothing. These rows are written directly as `source = 'seed_dummy'`,
// `status = 'active'` to give the page real shapes to render.
//
// Density is deliberately *mixed* (see SEED_CELLS): a handful of cells clear the
// 10-report "exact" threshold (the rich Position-Y view), while others stay
// sparse (1–4 reports) so the sparse-data fallback banner is exercised too.
//
// Deterministic: a fixed-seed PRNG drives every choice, so the same DB state in
// always produces the same fixtures out — re-running is reproducible and the
// test can assert exact counts. Idempotent: seedReports() deletes prior
// `seed_dummy` reports first (children CASCADE from rounds), so re-runs refresh
// rather than pile up.

import { eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";
import {
  companies,
  companyLevels,
  interviewReports,
  type NewInterviewReport,
  type NewRound,
  questions,
  questionTopics,
  roles,
  rounds,
  topics,
  users,
} from "../schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) + small choice helpers. One fixed seed for
// the whole run keeps fixtures reproducible across machines and CI.
// ---------------------------------------------------------------------------

const SEED = 0x10ad_5eed;

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const int = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[int(rng, 0, arr.length - 1)]!;
function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  const take = Math.min(n, pool.length);
  for (let i = 0; i < take; i++) {
    out.push(pool.splice(int(rng, 0, pool.length - 1), 1)[0]!);
  }
  return out;
}
// Weighted pick: entries are [value, weight].
function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, w] of entries) {
    if ((r -= w) <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

// ---------------------------------------------------------------------------
// Author fixtures. Eight seed users — a stable set of authors so reports have
// real FK targets. Upserted on clerk_id; usernames feed the future profile
// pages. Display attribution is per-report (anonymous vs display_name), so
// these names only surface where a report opts into attribution.
// ---------------------------------------------------------------------------

export interface SeedAuthor {
  clerkId: string;
  username: string;
  displayName: string;
}

export const SEED_AUTHORS: SeedAuthor[] = [
  { clerkId: "seed_author_01", username: "loopwalker", displayName: "Priya N." },
  { clerkId: "seed_author_02", username: "bytethinker", displayName: "Marcus L." },
  { clerkId: "seed_author_03", username: "stackgazer", displayName: "Aisha K." },
  { clerkId: "seed_author_04", username: "nullpointer", displayName: "Diego R." },
  { clerkId: "seed_author_05", username: "heapsort", displayName: "Wei C." },
  { clerkId: "seed_author_06", username: "asyncawait", displayName: "Sofia M." },
  { clerkId: "seed_author_07", username: "graphqueen", displayName: "Tomas H." },
  { clerkId: "seed_author_08", username: "edgecaser", displayName: "Lena P." },
];

// ---------------------------------------------------------------------------
// Density plan. Each cell names a (company slug, role slug, level display name)
// and how many reports to generate there. Mixed by design:
//   dense  (≥10) → clears the "exact" aggregate threshold (rich Position-Y)
//   medium (5–9) → just under; broadens to role scope with a soft banner
//   sparse (1–4) → exercises the sparse-data fallback banner hard
// Levels MUST match a curated company_levels.name for that company (verified by
// the seed runner; an unknown level throws rather than silently inserting junk).
// ---------------------------------------------------------------------------

export interface SeedCell {
  company: string;
  role: string;
  level: string;
  count: number;
}

export const SEED_CELLS: SeedCell[] = [
  // Dense — the showcase cells that render the full aggregate view.
  { company: "google", role: "swe", level: "L4", count: 20 },
  { company: "stripe", role: "backend", level: "L4", count: 18 },
  { company: "amazon", role: "swe", level: "SDE II", count: 15 },
  { company: "meta", role: "frontend", level: "E5", count: 14 },
  { company: "stripe", role: "backend", level: "L3", count: 12 },
  { company: "google", role: "swe", level: "L5", count: 11 },
  { company: "meta", role: "frontend", level: "E4", count: 10 },
  // Medium — just under the threshold; broadens to role scope.
  { company: "amazon", role: "swe", level: "SDE III", count: 8 },
  { company: "stripe", role: "frontend", level: "L4", count: 7 },
  { company: "airbnb", role: "fullstack", level: "G8", count: 6 },
  { company: "meta", role: "backend", level: "E5", count: 6 },
  { company: "netflix", role: "swe", level: "Senior", count: 5 },
  // Sparse — the fallback-banner cases.
  { company: "amazon", role: "data-engineer", level: "SDE II", count: 4 },
  { company: "stripe", role: "ml", level: "L4", count: 3 },
  { company: "uber", role: "backend", level: "4", count: 3 },
  { company: "coinbase", role: "backend", level: "IC4", count: 3 },
  { company: "google", role: "ai-engineer", level: "L5", count: 2 },
  { company: "meta", role: "mobile", level: "E4", count: 2 },
  { company: "openai", role: "ml", level: "IC4", count: 2 },
  { company: "databricks", role: "backend", level: "L4", count: 1 },
];

export const SEED_REPORT_TOTAL = SEED_CELLS.reduce((s, c) => s + c.count, 0);

// ---------------------------------------------------------------------------
// Content banks. Topic pools are keyed by role family so questions get
// plausible tags; round structure follows a realistic loop order.
// ---------------------------------------------------------------------------

const TOPIC_POOLS: Record<string, string[]> = {
  swe: ["arrays", "strings", "hash-maps", "dynamic-programming", "graphs", "two-pointers", "binary-search", "trees", "system-design", "object-oriented-design", "concurrency"],
  backend: ["system-design", "caching", "database-design", "sql", "concurrency", "api-design", "rate-limiting", "message-queues", "sharding", "arrays", "hash-maps", "graphs"],
  frontend: ["javascript", "typescript", "react", "web-performance", "arrays", "strings", "hash-maps", "system-design", "api-design", "object-oriented-design"],
  fullstack: ["javascript", "typescript", "react", "api-design", "database-design", "system-design", "arrays", "hash-maps", "caching", "sql"],
  ml: ["machine-learning", "deep-learning", "neural-networks", "nlp", "transformers", "statistics", "model-evaluation", "arrays", "dynamic-programming", "feature-engineering"],
  "ai-engineer": ["llms", "prompt-engineering", "embeddings", "transformers", "nlp", "machine-learning", "system-design", "api-design"],
  "data-engineer": ["etl", "data-pipelines", "data-modeling", "spark", "sql", "data-warehousing", "stream-processing", "system-design"],
  mobile: ["javascript", "arrays", "strings", "hash-maps", "system-design", "object-oriented-design", "concurrency"],
};
const DEFAULT_TOPICS = ["arrays", "strings", "hash-maps", "system-design", "dynamic-programming"];
const BEHAVIORAL_TOPICS = ["leadership", "conflict-resolution", "ownership", "teamwork", "dealing-with-ambiguity"];

// Canonical loop order. A report takes the first N rounds (N = 3..6), so the
// sequence stays realistic: screen → phone → coding → design → behavioral → HM.
const LOOP_TEMPLATE: NewRound["roundType"][] = [
  "recruiter-screen",
  "technical-phone",
  "onsite-coding",
  "onsite-system-design",
  "onsite-behavioral",
  "hiring-manager",
];

const CODING_PROMPTS = [
  "Implement a function over {t} — start brute force, then optimize for time.",
  "Classic {t} problem with a twist on the edge cases; expected optimal in 35 min.",
  "Two-part {t} question, second part raised the input size to force a better approach.",
  "Whiteboard a {t} solution and walk through the complexity out loud.",
];
const DESIGN_PROMPTS = [
  "Design a system touching {t}: scope, data model, then scale it to 10x traffic.",
  "Open-ended {t} design — they pushed hard on trade-offs and failure modes.",
  "Sketch the high-level architecture, then drill into {t} specifics.",
];
const BEHAVIORAL_PROMPTS = [
  "Tell me about a time you showed {t}.",
  "Walk me through a situation that tested your {t}.",
  "Describe a project where {t} was the deciding factor.",
];
const SCREEN_PROMPTS = [
  "Background, motivation, and a couple of warm-up {t} questions.",
  "Recruiter walked through the loop and asked light {t} fundamentals.",
];
const EXPERIENCE_BY_RATING: Record<NewRound["rating"], string[]> = {
  positive: [
    "Interviewer was friendly and gave hints when I got stuck. Felt collaborative.",
    "Clear problem statement, good back-and-forth, finished with time to spare.",
    "Strong signal — they dug into my approach and seemed genuinely engaged.",
  ],
  mixed: [
    "Fine overall but the prompt was ambiguous and ate into my time.",
    "Interviewer was quiet; hard to read whether my approach landed.",
    "Got the optimal solution but ran low on time for the follow-up.",
  ],
  negative: [
    "Rushed and adversarial; felt like a gotcha rather than a conversation.",
    "Vague requirements, no hints, and the interviewer seemed checked out.",
    "Hard curveball with no setup — left feeling it went poorly.",
  ],
};

export interface SeedReportsResult {
  authors: number;
  reports: number;
  rounds: number;
  questions: number;
  cells: number;
}

// Insert dummy reports per the SEED_CELLS plan. Returns counts for logging +
// tests. Does NOT emit outbox events — the runner backfills aggregates (and
// the operator runs `pnpm backfill:typesense`) wholesale afterward, which is
// cheaper than draining ~150 synthetic events.
export async function seedReports(db: Db): Promise<SeedReportsResult> {
  const rng = makeRng(SEED);

  // 1. Upsert authors.
  const authorRows = await db
    .insert(users)
    .values(
      SEED_AUTHORS.map((a) => ({
        clerkId: a.clerkId,
        username: a.username,
        displayName: a.displayName,
      })),
    )
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        username: sql`excluded.username`,
        displayName: sql`excluded.display_name`,
      },
    })
    .returning({ id: users.id });
  const authorIds = authorRows.map((r) => r.id);

  // 2. Resolve taxonomy ids referenced by the plan.
  const companySlugs = [...new Set(SEED_CELLS.map((c) => c.company))];
  const roleSlugs = [...new Set(SEED_CELLS.map((c) => c.role))];
  const companyRows = await db
    .select({ id: companies.id, slug: companies.slug })
    .from(companies)
    .where(inArray(companies.slug, companySlugs));
  const roleRows = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(inArray(roles.slug, roleSlugs));
  const companyId = new Map(companyRows.map((r) => [r.slug, r.id]));
  const roleId = new Map(roleRows.map((r) => [r.slug, r.id]));
  for (const slug of companySlugs) {
    if (!companyId.has(slug))
      throw new Error(`seed:reports — unknown company slug "${slug}". Run db:seed first.`);
  }
  for (const slug of roleSlugs) {
    if (!roleId.has(slug))
      throw new Error(`seed:reports — unknown role slug "${slug}". Run db:seed first.`);
  }

  // Level rows for the involved companies, keyed by `${companyId}::${name}`.
  const levelRows = await db
    .select({ id: companyLevels.id, companyId: companyLevels.companyId, name: companyLevels.name })
    .from(companyLevels)
    .where(inArray(companyLevels.companyId, [...companyId.values()]));
  const levelId = new Map(levelRows.map((r) => [`${r.companyId}::${r.name}`, r.id]));

  // Topic id lookup by slug (all curated topics).
  const topicRows = await db.select({ id: topics.id, slug: topics.slug }).from(topics);
  const topicId = new Map(topicRows.map((r) => [r.slug, r.id]));
  const resolveTopics = (slugs: string[]): string[] =>
    slugs.map((s) => topicId.get(s)).filter((x): x is string => Boolean(x));

  // 3. Idempotency: drop prior seed_dummy reports (rounds/questions/topics
  //    CASCADE from interview_reports via the rounds FK).
  await db.delete(interviewReports).where(eq(interviewReports.source, "seed_dummy"));

  // 4. Generate.
  let reportCount = 0;
  let roundCount = 0;
  let questionCount = 0;
  // Fixed reference date keeps interview_month / created_at reproducible.
  const REF = Date.UTC(2026, 4, 1); // 2026-05-01

  for (const cell of SEED_CELLS) {
    const cId = companyId.get(cell.company)!;
    const rId = roleId.get(cell.role)!;
    const lId = levelId.get(`${cId}::${cell.level}`);
    if (lId === undefined)
      throw new Error(
        `seed:reports — "${cell.company}" has no level "${cell.level}". Check the curated ladder.`,
      );
    const pool = TOPIC_POOLS[cell.role] ?? DEFAULT_TOPICS;

    for (let i = 0; i < cell.count; i++) {
      const author = pick(rng, authorIds);
      const monthsAgo = int(rng, 0, 13);
      const d = new Date(REF);
      d.setUTCMonth(d.getUTCMonth() - monthsAgo);
      const interviewMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

      const outcome = weighted<NewInterviewReport["outcome"]>(rng, [
        ["offer", 28],
        ["reject", 38],
        ["withdrew", 8],
        ["ghosted", 12],
        ["pending", 8],
        [null, 6],
      ]);
      const attribution = weighted<NonNullable<NewInterviewReport["displayAttribution"]>>(rng, [
        ["anonymous", 6],
        ["display_name", 4],
      ]);
      const evidenceVerified = rng() < 0.35;

      const reportInsert: NewInterviewReport = {
        source: "seed_dummy",
        createdByUserId: author,
        companyId: cId,
        canonicalRoleId: rId,
        level: cell.level,
        levelId: lId,
        interviewMonth,
        outcome,
        displayAttribution: attribution,
        evidenceVerified,
        status: "active",
        createdAt: d,
      };

      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(interviewReports)
          .values(reportInsert)
          .returning({ id: interviewReports.id });
        const reportId = inserted[0]!.id;
        reportCount++;

        const nRounds = int(rng, 3, 6);
        for (let r = 0; r < nRounds; r++) {
          const roundType = LOOP_TEMPLATE[r]!;
          // Offer-outcome reports skew toward positive ratings.
          const rating =
            outcome === "offer"
              ? weighted<NewRound["rating"]>(rng, [["positive", 6], ["mixed", 3], ["negative", 1]])
              : weighted<NewRound["rating"]>(rng, [["positive", 3], ["mixed", 4], ["negative", 3]]);

          const insertedRound = await tx
            .insert(rounds)
            .values({
              reportId,
              orderIndex: r,
              roundType,
              rating,
              experienceProse: pick(rng, EXPERIENCE_BY_RATING[rating]),
            })
            .returning({ id: rounds.id });
          const roundId = insertedRound[0]!.id;
          roundCount++;

          // Behavioral / screen rounds carry 1 question; technical rounds 1–3.
          const isBehavioral = roundType === "onsite-behavioral";
          const isScreen = roundType === "recruiter-screen";
          const nQ = isBehavioral || isScreen ? int(rng, 1, 2) : int(rng, 1, 3);
          for (let q = 0; q < nQ; q++) {
            const tag = isBehavioral
              ? pick(rng, BEHAVIORAL_TOPICS)
              : pick(rng, pool);
            const tagName = tag.replace(/-/g, " ");
            let prose: string;
            if (isBehavioral) prose = pick(rng, BEHAVIORAL_PROMPTS).replace("{t}", tagName);
            else if (isScreen) prose = pick(rng, SCREEN_PROMPTS).replace("{t}", tagName);
            else if (roundType === "onsite-system-design")
              prose = pick(rng, DESIGN_PROMPTS).replace("{t}", tagName);
            else prose = pick(rng, CODING_PROMPTS).replace("{t}", tagName);

            const insertedQ = await tx
              .insert(questions)
              .values({ roundId, orderIndex: q, questionProse: prose })
              .returning({ id: questions.id });
            const questionId = insertedQ[0]!.id;
            questionCount++;

            // ≥1 active topic per question (the submission invariant). Pull
            // 1–2 extra related tags from the same family when available.
            const extra = isBehavioral ? BEHAVIORAL_TOPICS : pool;
            const tagSlugs = [...new Set([tag, ...pickN(rng, extra, int(rng, 0, 2))])];
            const ids = resolveTopics(tagSlugs);
            if (ids.length > 0) {
              await tx
                .insert(questionTopics)
                .values(ids.map((topicId) => ({ questionId, topicId })));
            }
          }
        }
      });
    }
  }

  return {
    authors: authorIds.length,
    reports: reportCount,
    rounds: roundCount,
    questions: questionCount,
    cells: SEED_CELLS.length,
  };
}
