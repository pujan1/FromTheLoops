// Phase 4 action integration test — submission autosave + finalize guards.
//
// Real Postgres; Clerk, the rate limiter, and the BullMQ queue mocked. Focus is
// the action chain that wraps core's finalizeSubmission: the auth gate, the
// per-user budget → RATE_LIMIT_MESSAGE, the honeypot's invisible-success drop,
// schema rejection of malformed autosave, and ownership-scoped draft resolution.
// (A fully valid happy-path finalize lives in core/db tests; here we pin the
// wrapper's error mapping.)

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, sql } from "@fromtheloop/db";
import { RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { finalizeSubmissionAction, saveDraft } from "./actions";
import { rateLimitState, resetEdges, signInAs } from "@/tests/edges";

vi.mock("@clerk/nextjs/server", async () => {
  const { session } = await import("@/tests/edges");
  return {
    auth: async () => ({ userId: session.userId, sessionClaims: { metadata: { role: session.role } } }),
    currentUser: async () => session.user,
  };
});

vi.mock("@/lib/rate-limit", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/rate-limit")>();
  const { rateLimitState } = await import("@/tests/edges");
  return {
    ...actual,
    rateLimit: async () => ({ ok: rateLimitState.allow }),
    slidingWindowRateLimit: async () => ({ ok: rateLimitState.allow }),
  };
});

vi.mock("@/lib/queue", async () => {
  const { calls } = await import("@/tests/edges");
  return {
    getNotificationsQueue: () => ({
      add: async (name: string, data: unknown, opts?: unknown) => {
        calls.enqueuedJobs.push({ name, data, opts });
      },
    }),
  };
});

vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

async function draftCount(): Promise<number> {
  const rows = await getDb().execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM submission_drafts`,
  );
  return Number(rows[0]?.n ?? 0);
}

beforeEach(resetEdges);

describe("saveDraft", () => {
  it("a valid (empty-but-well-formed) draft persists and returns its id", async () => {
    signInAs({ id: "clerk_writer", role: "user" });

    const res = await saveDraft({ id: null, data: {} });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await draftCount()).toBe(1);
  });

  it("a signed-out caller → unauthenticated, nothing written", async () => {
    const res = await saveDraft({ id: null, data: {} });
    expect(res).toMatchObject({ ok: false, code: "unauthenticated" });
    expect(await draftCount()).toBe(0);
  });

  it("over budget → rate_limited with the shared message, no write", async () => {
    signInAs({ id: "clerk_writer", role: "user" });
    rateLimitState.allow = false;

    const res = await saveDraft({ id: null, data: {} });

    expect(res).toMatchObject({ ok: false, code: "rate_limited", message: RATE_LIMIT_MESSAGE });
    expect(await draftCount()).toBe(0);
  });

  it("a tripped honeypot → benign success, silently no write", async () => {
    signInAs({ id: "clerk_writer", role: "user" });

    const res = await saveDraft({ id: null, data: {}, honeypot: "i am a bot" });

    expect(res).toEqual({ ok: true, data: { id: "" } });
    expect(await draftCount()).toBe(0);
  });

  it("malformed draft data → invalid, no write", async () => {
    signInAs({ id: "clerk_writer", role: "user" });

    const res = await saveDraft({ id: null, data: { rounds: "not-an-array" } });

    expect(res).toMatchObject({ ok: false, code: "invalid" });
    expect(await draftCount()).toBe(0);
  });
});

describe("finalizeSubmissionAction", () => {
  it("a signed-out caller → unauthenticated", async () => {
    const res = await finalizeSubmissionAction({ draftId: crypto.randomUUID() });
    expect(res).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("over budget → rate_limited", async () => {
    signInAs({ id: "clerk_writer", role: "user" });
    rateLimitState.allow = false;
    const res = await finalizeSubmissionAction({ draftId: crypto.randomUUID() });
    expect(res).toMatchObject({ ok: false, code: "rate_limited" });
  });

  it("a tripped honeypot → benign success with no report", async () => {
    signInAs({ id: "clerk_writer", role: "user" });
    const res = await finalizeSubmissionAction({ draftId: crypto.randomUUID(), honeypot: "bot" });
    expect(res).toEqual({ ok: true, data: null });
  });

  it("a foreign / missing draft → invalid (ownership-scoped lookup misses)", async () => {
    signInAs({ id: "clerk_writer", role: "user" });
    const res = await finalizeSubmissionAction({ draftId: crypto.randomUUID() });
    expect(res).toMatchObject({ ok: false, code: "invalid" });
  });
});
