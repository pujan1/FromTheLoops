// Moderation data access (Sprint 6 Day 3). The queue read-models + the
// approve/reject commands behind /admin/queues/*, plus logModAction — the
// append-only audit write every command funnels through (pulled forward from
// Day 4 so no mod action ever runs unlogged; PLAN.md §Section 230 hygiene).
//
// Commands run in a transaction so the taxonomy mutation and its audit row
// commit together — an action is either logged-and-applied or neither.
//
// Reject sets status='rejected' (added to taxonomy_status this sprint) rather
// than deleting: reports FK to taxonomy with ON DELETE RESTRICT, and every
// public surface already filters status='active', so a rejected row drops out
// everywhere with no new predicate.

import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { companies, modActionLogs, roles, topics, users } from "./schema/index.js";
import * as schema from "./schema/index.js";

type Db = PostgresJsDatabase<typeof schema>;
// A query runner that is either the pooled db or an open transaction. Lets the
// command helpers pass their `tx` into logModAction so the audit write joins the
// same transaction. (Canonical drizzle idiom for "accepts db or tx".)
type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// Mirror of the mod_action_type enum (schema/enums.ts).
export type ModActionType =
  | "approve"
  | "reject"
  | "merge"
  | "ban"
  | "delete"
  | "hide"
  | "edit_taxonomy";

export type LogModActionInput = {
  // Internal users.id of the acting moderator (NOT their Clerk id).
  modUserId: string;
  actionType: ModActionType;
  // Polymorphic target — e.g. "company", "topic", "role".
  targetType: string;
  targetId: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logModAction(db: Executor, input: LogModActionInput): Promise<void> {
  await db.insert(modActionLogs).values({
    modUserId: input.modUserId,
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  });
}

/* ----------------------------- read-models ----------------------------- */

export type PendingCompanyItem = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  createdAt: Date;
  suggestedByKarma: number | null;
};

export async function listPendingCompanies(db: Db): Promise<PendingCompanyItem[]> {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      domain: companies.domain,
      createdAt: companies.createdAt,
      suggestedByKarma: users.karma,
    })
    .from(companies)
    .leftJoin(users, eq(companies.suggestedByUserId, users.id))
    .where(eq(companies.status, "pending"))
    .orderBy(desc(companies.createdAt));
}

export type PendingTopicItem = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  createdAt: Date;
  suggestedByKarma: number | null;
};

export async function listPendingTopics(db: Db): Promise<PendingTopicItem[]> {
  return db
    .select({
      id: topics.id,
      name: topics.name,
      slug: topics.slug,
      category: topics.category,
      createdAt: topics.createdAt,
      suggestedByKarma: users.karma,
    })
    .from(topics)
    .leftJoin(users, eq(topics.suggestedByUserId, users.id))
    .where(eq(topics.status, "pending"))
    .orderBy(desc(topics.createdAt));
}

export type PendingRoleItem = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  // Canonical role this alias folds into, if any.
  canonicalName: string | null;
};

export async function listPendingRoles(db: Db): Promise<PendingRoleItem[]> {
  const canonical = alias(roles, "canonical");
  return db
    .select({
      id: roles.id,
      name: roles.name,
      slug: roles.slug,
      createdAt: roles.createdAt,
      canonicalName: canonical.name,
    })
    .from(roles)
    .leftJoin(canonical, eq(roles.mergedIntoId, canonical.id))
    .where(eq(roles.status, "pending"))
    .orderBy(desc(roles.createdAt));
}

/* --------------------------- audit history ----------------------------- */
// The read side of the audit log (Day 4). logModAction writes; this reads back.
// One query serves two surfaces: pass no target for the global recent-activity
// feed (/admin/audit), or a (targetType, targetId) pair for "everything that
// happened to this entity". Joins the acting mod so the view shows a name, not
// a UUID. Ordered newest-first; capped so the global feed can't run away.

export type ModActionLogItem = {
  id: string;
  actionType: ModActionType;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  // Acting moderator, resolved to a human label (displayName ?? username).
  // Null only if the mod row was purged — the FK is ON DELETE RESTRICT, so in
  // practice the join always lands.
  modName: string | null;
  modKarma: number | null;
};

export async function listModActions(
  db: Db,
  opts: { targetType?: string; targetId?: string; limit?: number } = {},
): Promise<ModActionLogItem[]> {
  const filters = [];
  if (opts.targetType) filters.push(eq(modActionLogs.targetType, opts.targetType));
  if (opts.targetId) filters.push(eq(modActionLogs.targetId, opts.targetId));

  const rows = await db
    .select({
      id: modActionLogs.id,
      actionType: modActionLogs.actionType,
      targetType: modActionLogs.targetType,
      targetId: modActionLogs.targetId,
      reason: modActionLogs.reason,
      metadata: modActionLogs.metadata,
      createdAt: modActionLogs.createdAt,
      modDisplayName: users.displayName,
      modUsername: users.username,
      modKarma: users.karma,
    })
    .from(modActionLogs)
    .leftJoin(users, eq(modActionLogs.modUserId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(modActionLogs.createdAt))
    .limit(opts.limit ?? 100);

  return rows.map((r) => ({
    id: r.id,
    actionType: r.actionType,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt,
    modName: r.modDisplayName ?? r.modUsername ?? null,
    modKarma: r.modKarma,
  }));
}

/* ------------------------------ commands ------------------------------- */
// All return true iff a pending row was actually transitioned — so the queue UI
// drops exactly the rows that changed, and a double-submit is a logged no-op
// returning false (the status guard in the WHERE makes it idempotent).

type Command = { id: string; modUserId: string; reason?: string };

export async function approvePendingCompany(db: Db, { id, modUserId }: Command): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(companies)
      .set({ status: "active" })
      .where(and(eq(companies.id, id), eq(companies.status, "pending")))
      .returning({ id: companies.id });
    if (updated.length === 0) return false;
    await logModAction(tx, { modUserId, actionType: "approve", targetType: "company", targetId: id });
    return true;
  });
}

export async function rejectPendingCompany(db: Db, { id, modUserId, reason }: Command): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(companies)
      .set({ status: "rejected" })
      .where(and(eq(companies.id, id), eq(companies.status, "pending")))
      .returning({ id: companies.id });
    if (updated.length === 0) return false;
    await logModAction(tx, { modUserId, actionType: "reject", targetType: "company", targetId: id, reason });
    return true;
  });
}

export async function approvePendingTopic(db: Db, { id, modUserId }: Command): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(topics)
      .set({ status: "active" })
      .where(and(eq(topics.id, id), eq(topics.status, "pending")))
      .returning({ id: topics.id });
    if (updated.length === 0) return false;
    await logModAction(tx, { modUserId, actionType: "approve", targetType: "topic", targetId: id });
    return true;
  });
}

export async function rejectPendingTopic(db: Db, { id, modUserId, reason }: Command): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(topics)
      .set({ status: "rejected" })
      .where(and(eq(topics.id, id), eq(topics.status, "pending")))
      .returning({ id: topics.id });
    if (updated.length === 0) return false;
    await logModAction(tx, { modUserId, actionType: "reject", targetType: "topic", targetId: id, reason });
    return true;
  });
}

// Approving a role alias folds it into its canonical row: the alias's name (and
// any aliases it carried) join the canonical's aliases, and the alias row is
// marked 'merged'. A pending role with no canonical target is just promoted to
// 'active' (defensive — roles have no inline-create path today).
export async function approvePendingRole(db: Db, { id, modUserId }: Command): Promise<boolean> {
  return db.transaction(async (tx) => {
    const found = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
    const role = found[0];
    if (!role || role.status !== "pending") return false;

    if (role.mergedIntoId) {
      const canonRows = await tx.select().from(roles).where(eq(roles.id, role.mergedIntoId)).limit(1);
      const canon = canonRows[0];
      if (canon) {
        const merged = Array.from(new Set([...canon.aliases, role.name, ...role.aliases]));
        await tx.update(roles).set({ aliases: merged }).where(eq(roles.id, canon.id));
      }
      await tx.update(roles).set({ status: "merged" }).where(eq(roles.id, role.id));
      await logModAction(tx, {
        modUserId,
        actionType: "merge",
        targetType: "role",
        targetId: id,
        metadata: { mergedInto: role.mergedIntoId },
      });
    } else {
      await tx.update(roles).set({ status: "active" }).where(eq(roles.id, role.id));
      await logModAction(tx, { modUserId, actionType: "approve", targetType: "role", targetId: id });
    }
    return true;
  });
}

export async function rejectPendingRole(db: Db, { id, modUserId, reason }: Command): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(roles)
      .set({ status: "rejected" })
      .where(and(eq(roles.id, id), eq(roles.status, "pending")))
      .returning({ id: roles.id });
    if (updated.length === 0) return false;
    await logModAction(tx, { modUserId, actionType: "reject", targetType: "role", targetId: id, reason });
    return true;
  });
}
