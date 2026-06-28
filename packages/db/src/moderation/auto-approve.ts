import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { companies, modActionLogs, topics } from "../schema/index.js";
import { DAY_MS } from "../lib/time.js";
import { getOrCreateSystemUser } from "../users/system-user.js";
import { userIsVerified } from "../users/users.js";
import { DEDUP_BLOCK_THRESHOLD, nearestActiveMatch } from "../taxonomy/dedup.js";
import { type Db, logModAction } from "./shared.js";
import type { AutoApprovalItem } from "./types.js";

export type AutoApproveKind = "company" | "topic";

const NAME_MIN = 2;
const NAME_MAX = 80;

// Basic sanity, not the abuse blocklist.
export function nameLooksClean(name: string): boolean {
  const n = name.trim();
  if (n.length < NAME_MIN || n.length > NAME_MAX) return false;
  if (!/[a-z0-9]/i.test(n)) return false;
  if ([...n].some((ch) => ch.charCodeAt(0) < 32)) return false;
  return true;
}

export type AutoApproveSignals = {
  trustedSubmitter: boolean;
  nearestScore: number | null;
  nameClean: boolean;
};

export type AutoApproveDecision = {
  approve: boolean;
  reasons: string[];
  blockedBy: string[];
};

export function evaluateAutoApprove(s: AutoApproveSignals): AutoApproveDecision {
  const reasons: string[] = [];
  const blockedBy: string[] = [];

  if (s.trustedSubmitter) reasons.push("verified-submitter");
  else blockedBy.push("unverified-submitter");

  if (s.nameClean) reasons.push("name-ok");
  else blockedBy.push("name-failed-sanity");

  if (s.nearestScore == null || s.nearestScore < DEDUP_BLOCK_THRESHOLD) {
    reasons.push("no-near-duplicate");
  } else {
    blockedBy.push("near-duplicate");
  }

  return { approve: blockedBy.length === 0, reasons, blockedBy };
}

export type AutoApproveOutcome = {
  kind: AutoApproveKind;
  id: string;
  name: string;
  approved: boolean;
  reasons: string[];
  blockedBy: string[];
};

export type AutoApproveSummary = {
  evaluated: number;
  approved: number;
  outcomes: AutoApproveOutcome[];
};

type Candidate = { kind: AutoApproveKind; id: string; name: string; suggestedBy: string | null };

async function pendingCandidates(
  db: Db,
  only?: { kind: AutoApproveKind; id: string },
): Promise<Candidate[]> {
  const companyWhere = only
    ? and(eq(companies.id, only.id), eq(companies.status, "pending"))
    : eq(companies.status, "pending");
  const topicWhere = only
    ? and(eq(topics.id, only.id), eq(topics.status, "pending"))
    : eq(topics.status, "pending");

  const out: Candidate[] = [];
  if (!only || only.kind === "company") {
    const rows = await db
      .select({ id: companies.id, name: companies.name, suggestedBy: companies.suggestedByUserId })
      .from(companies)
      .where(companyWhere);
    for (const r of rows) out.push({ kind: "company", id: r.id, name: r.name, suggestedBy: r.suggestedBy });
  }
  if (!only || only.kind === "topic") {
    const rows = await db
      .select({ id: topics.id, name: topics.name, suggestedBy: topics.suggestedByUserId })
      .from(topics)
      .where(topicWhere);
    for (const r of rows) out.push({ kind: "topic", id: r.id, name: r.name, suggestedBy: r.suggestedBy });
  }
  return out;
}

// `only` scores a single entity; omit to sweep all pending companies + topics.
export async function runAutoApprove(
  db: Db,
  opts: { only?: { kind: AutoApproveKind; id: string } } = {},
): Promise<AutoApproveSummary> {
  const candidates = await pendingCandidates(db, opts.only);
  if (candidates.length === 0) return { evaluated: 0, approved: 0, outcomes: [] };

  const system = await getOrCreateSystemUser(db);
  const outcomes: AutoApproveOutcome[] = [];

  for (const c of candidates) {
    const trustedSubmitter = c.suggestedBy ? await userIsVerified(db, c.suggestedBy) : false;
    const nearest = await nearestActiveMatch(db, {
      kind: c.kind,
      name: c.name,
      excludeId: c.id,
      minScore: 0,
    });
    const decision = evaluateAutoApprove({
      trustedSubmitter,
      nearestScore: nearest?.score ?? null,
      nameClean: nameLooksClean(c.name),
    });

    let approved = false;
    if (decision.approve) {
      approved = await promote(db, c, system.id, decision.reasons);
    }
    outcomes.push({ kind: c.kind, id: c.id, name: c.name, approved, reasons: decision.reasons, blockedBy: decision.blockedBy });
  }

  return {
    evaluated: outcomes.length,
    approved: outcomes.filter((o) => o.approved).length,
    outcomes,
  };
}

// Returns false if the row was no longer pending (nothing logged).
async function promote(db: Db, c: Candidate, systemUserId: string, reasons: string[]): Promise<boolean> {
  const table = c.kind === "company" ? companies : topics;
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(table)
      .set({ status: "active" })
      .where(and(eq(table.id, c.id), eq(table.status, "pending")))
      .returning({ id: table.id });
    if (updated.length === 0) return false;
    await logModAction(tx, {
      modUserId: systemUserId,
      actionType: "approve",
      targetType: c.kind,
      targetId: c.id,
      metadata: { auto: true, reasons },
    });
    return true;
  });
}

export async function listAutoApprovals(
  db: Db,
  opts: { sinceMs?: number; limit?: number } = {},
): Promise<AutoApprovalItem[]> {
  const cutoff = new Date(Date.now() - (opts.sinceMs ?? DAY_MS));

  const rows = await db
    .select({
      id: modActionLogs.id,
      targetType: modActionLogs.targetType,
      targetId: modActionLogs.targetId,
      metadata: modActionLogs.metadata,
      createdAt: modActionLogs.createdAt,
    })
    .from(modActionLogs)
    .where(
      and(
        eq(modActionLogs.actionType, "approve"),
        gte(modActionLogs.createdAt, cutoff),
        sql`${modActionLogs.metadata} ->> 'auto' = 'true'`,
      ),
    )
    .orderBy(desc(modActionLogs.createdAt))
    .limit(opts.limit ?? 200);

  const companyIds = rows.filter((r) => r.targetType === "company").map((r) => r.targetId);
  const topicIds = rows.filter((r) => r.targetType === "topic").map((r) => r.targetId);
  const nameMap = new Map<string, string>();
  if (companyIds.length) {
    for (const r of await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds))) {
      nameMap.set(r.id, r.name);
    }
  }
  if (topicIds.length) {
    for (const r of await db.select({ id: topics.id, name: topics.name }).from(topics).where(inArray(topics.id, topicIds))) {
      nameMap.set(r.id, r.name);
    }
  }

  return rows.map((r) => {
    const meta = (r.metadata as { reasons?: unknown } | null) ?? null;
    const reasons = Array.isArray(meta?.reasons) ? (meta.reasons as string[]) : [];
    return {
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      name: nameMap.get(r.targetId) ?? null,
      reasons,
      createdAt: r.createdAt,
    };
  });
}
