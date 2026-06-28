// pg_trgm dedup signal over name+aliases, shared by two consumers with two
// thresholds: a strong match BLOCKS auto-approve; a weaker one shows a "possible
// duplicate" hint in the mod queue.

import { sql } from "drizzle-orm";
import type { Db } from "../lib/types.js";

// At/above this, auto-approve backs off (human decides new-vs-merge).
export const DEDUP_BLOCK_THRESHOLD = 0.55;

// At/above this, show a "possible duplicate" hint; never blocks.
export const DEDUP_HINT_THRESHOLD = 0.35;

export type TaxonomyKind = "company" | "topic" | "role";

export type NearestMatch = {
  id: string;
  name: string;
  score: number;
};

const TABLE: Record<TaxonomyKind, string> = {
  company: "companies",
  topic: "topics",
  role: "roles",
};

// Closest active same-kind row to `name`, or null if nothing clears `minScore`.
export async function nearestActiveMatch(
  db: Db,
  input: { kind: TaxonomyKind; name: string; excludeId?: string; minScore?: number },
): Promise<NearestMatch | null> {
  const name = input.name.trim();
  if (name.length === 0) return null;
  const minScore = input.minScore ?? DEDUP_HINT_THRESHOLD;
  const table = sql.raw(TABLE[input.kind]);
  const exclude = input.excludeId ?? "00000000-0000-0000-0000-000000000000";

  const rows = await db.execute<NearestMatch>(sql`
    SELECT id, name,
      GREATEST(
        similarity(name, ${name}),
        similarity(taxonomy_aliases_text(aliases), ${name})
      ) AS score
    FROM ${table}
    WHERE status = 'active'
      AND id <> ${exclude}::uuid
      AND (
        name % ${name}
        OR taxonomy_aliases_text(aliases) % ${name}
      )
    ORDER BY score DESC, name ASC
    LIMIT 1
  `);

  const top = rows[0];
  if (!top || Number(top.score) < minScore) return null;
  return { id: top.id, name: top.name, score: Number(top.score) };
}
