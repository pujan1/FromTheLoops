// Phase 4 action integration test — report edit-entry + soft-delete.
//
// Real Postgres, Clerk + next/* mocked. These actions re-check auth + ownership
// + the 24h window + the impersonation guard server-side; the UI only renders
// the controls when allowed, but a stale page or hand-crafted POST must not slip
// past. Ownership is scoped in the DB, so a foreign id leaks no existence signal
// (404 / silent redirect, never "you don't own this").

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, getReportForEdit } from "@fromtheloop/db";
import { softDeleteReportAction, startReportEdit } from "./actions";
import { VIEW_AS_COOKIE } from "@/lib/view-as";
import { calls, NotFoundError, RedirectError, resetEdges, signInAs } from "@/tests/edges";
import { reportStatus, seedReport } from "@/tests/seed";

vi.mock("@clerk/nextjs/server", async () => {
  const { session } = await import("@/tests/edges");
  return {
    auth: async () => ({ userId: session.userId, sessionClaims: { metadata: { role: session.role } } }),
    currentUser: async () => session.user,
  };
});

vi.mock("next/headers", async () => {
  const { calls } = await import("@/tests/edges");
  return {
    cookies: async () => ({
      get: (name: string) => {
        const e = calls.cookieJar.get(name);
        return e ? { name, value: e.value } : undefined;
      },
    }),
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

vi.mock("next/cache", async () => {
  const { calls } = await import("@/tests/edges");
  return {
    revalidatePath: (p: string) => calls.revalidatedPaths.push(p),
    revalidateTag: (t: string) => calls.revalidatedPaths.push(`tag:${t}`),
  };
});

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(resetEdges);

describe("startReportEdit", () => {
  it("owner within the window → draft created, redirected to rounds", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    signInAs({ id: "clerk_owner", role: "user" });

    await expect(startReportEdit(form({ reportId }))).rejects.toMatchObject({
      url: expect.stringContaining("/submit/rounds?draft="),
    } satisfies Partial<RedirectError>);
  });

  it("refuses while impersonating (before any lookup)", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    signInAs({ id: "clerk_owner", role: "admin" });
    calls.cookieJar.set(VIEW_AS_COOKIE, { value: "some-target-id" });

    await expect(startReportEdit(form({ reportId }))).rejects.toThrow(/view as/i);
  });

  it("a missing reportId → notFound", async () => {
    signInAs({ id: "clerk_owner", role: "user" });
    await expect(startReportEdit(form({}))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a signed-out caller → redirect to sign-in", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    await expect(startReportEdit(form({ reportId }))).rejects.toMatchObject({
      url: "/sign-in",
    });
  });

  it("a non-owner → notFound (no existence signal)", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    signInAs({ id: "clerk_intruder", role: "user" });

    await expect(startReportEdit(form({ reportId }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("window closed → bounce to the report view, no edit draft", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner", lockedInPast: true });
    signInAs({ id: "clerk_owner", role: "user" });

    await expect(startReportEdit(form({ reportId }))).rejects.toMatchObject({
      url: `/reports/${reportId}`,
    });
  });
});

describe("softDeleteReportAction", () => {
  it("owner deletes → status flips, cache busted, redirected to view", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    signInAs({ id: "clerk_owner", role: "user" });

    await expect(softDeleteReportAction(form({ reportId }))).rejects.toBeInstanceOf(RedirectError);

    expect(await reportStatus(reportId)).toBe("deleted");
    expect(calls.revalidatedPaths.some((p) => p.startsWith("tag:"))).toBe(true);
  });

  it("non-owner delete is a silent no-op (still redirects, report survives)", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    signInAs({ id: "clerk_intruder", role: "user" });

    await expect(softDeleteReportAction(form({ reportId }))).rejects.toBeInstanceOf(RedirectError);

    // Owner's report is untouched — ownership scoping matched nothing.
    expect(await reportStatus(reportId)).toBe("active");
  });

  it("refuses while impersonating", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    signInAs({ id: "clerk_owner", role: "admin" });
    calls.cookieJar.set(VIEW_AS_COOKIE, { value: "some-target-id" });

    await expect(softDeleteReportAction(form({ reportId }))).rejects.toThrow(/view as/i);
    expect(await reportStatus(reportId)).toBe("active");
  });

  // Keep a reference to the read used elsewhere so the import is meaningful even
  // if a future case asserts on the full edit detail.
  it("the seeded report is owner-readable (sanity)", async () => {
    const { reportId, owner } = await seedReport({ ownerClerkId: "clerk_owner" });
    const detail = await getReportForEdit(getDb(), reportId, owner.id);
    expect(detail).not.toBeNull();
  });
});
