// Phase 4 action integration test — "view as user" enter/exit impersonation.
//
// Real Postgres, Clerk + next/headers + next/navigation mocked. Proves the
// admin gate on enter, the audit row that the plan requires (impersonation is
// logged even though it mutates nothing), the self-view and missing-target
// guards bailing before any cookie/log is written, and that exit is ungated
// (clearing the cookie is always safe — the only way out for a holder).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, getOrCreateUserByClerkId, listModActions, type User } from "@fromtheloop/db";
import { enterViewAs, exitViewAs } from "./actions";
import { VIEW_AS_COOKIE } from "@/lib/view-as";
import { calls, NotFoundError, RedirectError, resetEdges, signInAs } from "@/tests/edges";

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

vi.mock("next/navigation", async () => {
  const { NotFoundError, RedirectError } = await import("@/tests/edges");
  return {
    notFound: () => {
      throw new NotFoundError();
    },
    redirect: (url: string) => {
      throw new RedirectError(url);
    },
  };
});

vi.mock("next/headers", async () => {
  const { calls } = await import("@/tests/edges");
  return {
    cookies: async () => ({
      set: (name: string, value: string, opts?: unknown) =>
        calls.cookieJar.set(name, { value, opts }),
      delete: (name: string) => calls.cookieJar.delete(name),
      get: (name: string) => {
        const e = calls.cookieJar.get(name);
        return e ? { name, value: e.value } : undefined;
      },
    }),
  };
});

beforeEach(resetEdges);

// Insert a user to be impersonated and return its internal row.
async function makeTarget(clerkId = "clerk_target"): Promise<User> {
  return getOrCreateUserByClerkId(getDb(), { clerkId, email: `${clerkId}@test.dev` });
}

describe("enterViewAs", () => {
  it("admin impersonates a user → cookie set, view_as audited, redirected", async () => {
    const target = await makeTarget();
    signInAs({ id: "clerk_admin", role: "admin" });

    await expect(enterViewAs(target.id)).rejects.toMatchObject({
      url: "/dashboard",
    } satisfies Partial<RedirectError>);

    expect(calls.cookieJar.get(VIEW_AS_COOKIE)?.value).toBe(target.id);

    const logs = await listModActions(getDb(), { targetType: "user", targetId: target.id });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actionType).toBe("view_as");
  });

  it("a non-admin is refused → notFound, no cookie, no log", async () => {
    const target = await makeTarget();
    signInAs({ id: "clerk_mod", role: "moderator" });

    await expect(enterViewAs(target.id)).rejects.toBeInstanceOf(NotFoundError);

    expect(calls.cookieJar.has(VIEW_AS_COOKIE)).toBe(false);
    expect(await listModActions(getDb(), { targetType: "user" })).toHaveLength(0);
  });

  it("a missing target → throws, nothing written", async () => {
    signInAs({ id: "clerk_admin", role: "admin" });

    await expect(
      enterViewAs("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(/no longer exists/i);

    expect(calls.cookieJar.has(VIEW_AS_COOKIE)).toBe(false);
    expect(await listModActions(getDb(), { targetType: "user" })).toHaveLength(0);
  });

  it("an admin viewing themselves is a no-op → redirect, no cookie, no log", async () => {
    // The admin's own internal row is the target.
    const admin = await makeTarget("clerk_admin");
    signInAs({ id: "clerk_admin", role: "admin" });

    await expect(enterViewAs(admin.id)).rejects.toBeInstanceOf(RedirectError);

    expect(calls.cookieJar.has(VIEW_AS_COOKIE)).toBe(false);
    expect(await listModActions(getDb(), { targetType: "user" })).toHaveLength(0);
  });
});

describe("exitViewAs", () => {
  it("clears the impersonation cookie and redirects, no role gate", async () => {
    calls.cookieJar.set(VIEW_AS_COOKIE, { value: "some-user-id" });
    // Note: not signed in as admin — exit must still work.

    await expect(exitViewAs()).rejects.toBeInstanceOf(RedirectError);

    expect(calls.cookieJar.has(VIEW_AS_COOKIE)).toBe(false);
  });
});
