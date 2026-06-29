// Phase 4 action integration test — the generic moderation-queue dispatcher.
//
// Real Postgres, Clerk + next/cache mocked. runQueueAction is the one entry
// point every <ModQueue> calls, so the bugs that hurt are in its routing, not
// the per-command DB writes (those are tested in packages/db). Proves: the
// moderator gate fires server-side, unknown queue / unwired action are rejected
// loudly, a reason-requiring action is blocked without one (the server-side
// backstop to the client check), and an approve actually flips the row + audits.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDb,
  listModActions,
  listPendingCompanies,
  suggestCompany,
} from "@fromtheloop/db";
import { runQueueAction } from "./actions";
import type { QueueId } from "../queue-config";
import { calls, NotFoundError, resetEdges, signInAs } from "@/tests/edges";

vi.mock("@clerk/nextjs/server", async () => {
  const { session } = await import("@/tests/edges");
  return {
    auth: async () => ({
      userId: session.userId,
      sessionClaims: { metadata: { role: session.role } },
    }),
    currentUser: async () => session.user,
  };
});

vi.mock("next/cache", async () => {
  const { calls } = await import("@/tests/edges");
  return {
    revalidatePath: (p: string) => calls.revalidatedPaths.push(p),
    revalidateTag: () => {},
  };
});

vi.mock("next/navigation", async () => {
  const { NotFoundError } = await import("@/tests/edges");
  return {
    notFound: () => {
      throw new NotFoundError();
    },
  };
});

beforeEach(resetEdges);

// Seed a pending company and return its id (the thing a queue action acts on).
async function pendingCompany(name = "Acme Corp"): Promise<string> {
  const { company } = await suggestCompany(getDb(), { name });
  return company.id;
}

describe("runQueueAction — gating & routing", () => {
  it("a non-moderator is refused → notFound", async () => {
    signInAs({ id: "clerk_user", role: "user" });
    await expect(
      runQueueAction({ queueId: "companies", actionId: "approve", itemIds: ["x"] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("an unknown queue is rejected", async () => {
    signInAs({ id: "clerk_mod", role: "moderator" });
    const res = await runQueueAction({
      queueId: "nope" as QueueId,
      actionId: "approve",
      itemIds: [],
    });
    expect(res).toEqual({ ok: false, error: "Unknown queue." });
  });

  it("an action not wired for the queue is rejected loudly", async () => {
    signInAs({ id: "clerk_mod", role: "moderator" });
    const res = await runQueueAction({
      queueId: "companies",
      actionId: "frobnicate",
      itemIds: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/isn't wired/i);
  });

  it("a reason-requiring action without a reason is blocked before any write", async () => {
    const id = await pendingCompany();
    signInAs({ id: "clerk_mod", role: "moderator" });

    const res = await runQueueAction({
      queueId: "companies",
      actionId: "reject",
      itemIds: [id],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/reason is required/i);
    // The company is untouched — still pending.
    expect(await listPendingCompanies(getDb())).toHaveLength(1);
  });
});

describe("runQueueAction — applying an action", () => {
  it("approve promotes the pending company and audits it", async () => {
    const id = await pendingCompany();
    signInAs({ id: "clerk_mod", role: "moderator" });

    const res = await runQueueAction({
      queueId: "companies",
      actionId: "approve",
      itemIds: [id],
    });

    expect(res).toEqual({ ok: true, processed: [id] });
    expect(await listPendingCompanies(getDb())).toHaveLength(0);
    expect(calls.revalidatedPaths).toContain("/admin/queues/companies");

    const logs = await listModActions(getDb(), { targetType: "company", targetId: id });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actionType).toBe("approve");
  });

  it("an already-resolved id is a no-op (not in processed), still ok", async () => {
    const id = await pendingCompany();
    signInAs({ id: "clerk_mod", role: "moderator" });
    // First approve consumes it.
    await runQueueAction({ queueId: "companies", actionId: "approve", itemIds: [id] });
    resetEdges();
    signInAs({ id: "clerk_mod", role: "moderator" });

    const res = await runQueueAction({
      queueId: "companies",
      actionId: "approve",
      itemIds: [id],
    });

    expect(res).toEqual({ ok: true, processed: [] });
  });
});
