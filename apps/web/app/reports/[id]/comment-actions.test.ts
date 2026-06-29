// Phase 4 action integration test — the report conversation write actions.
//
// Real Postgres, Clerk + next/headers + next/cache mocked. The db layer owns the
// per-rule guards (length, rate limit, active-report-only); these action tests
// pin the wiring above it: the impersonation refusal (a write must not fire as
// the admin mid "view as"), the signed-out refusal, the body-validation passthrough,
// and that a successful post persists + revalidates the report page.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, listCommentsForReport } from "@fromtheloop/db";
import {
  createCommentAction,
  deleteCommentAction,
  editCommentAction,
} from "./comment-actions";
import { VIEW_AS_COOKIE } from "@/lib/view-as";
import { calls, resetEdges, signInAs } from "@/tests/edges";
import { seedReport } from "@/tests/seed";

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

vi.mock("next/cache", async () => {
  const { calls } = await import("@/tests/edges");
  return { revalidatePath: (p: string) => calls.revalidatedPaths.push(p) };
});

const base = {
  body: "Solid writeup, the system-design round matches my loop.",
  displayAttribution: "display_name" as const,
};

beforeEach(resetEdges);

describe("createCommentAction", () => {
  it("signed-in user posts on an active report → persisted + page revalidated", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    signInAs({ id: "clerk_commenter", role: "user" });

    const res = await createCommentAction({ reportId, ...base });

    expect(res).toEqual({ ok: true });
    const page = await listCommentsForReport(getDb(), { reportId, viewerId: null, sort: "newest", limit: 10, offset: 0 });
    expect(page).toHaveLength(1);
    expect(calls.revalidatedPaths).toContain(`/reports/${reportId}`);
  });

  it("refuses while impersonating → read_only_view_as, nothing written", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    signInAs({ id: "clerk_admin", role: "admin" });
    calls.cookieJar.set(VIEW_AS_COOKIE, { value: "some-target-id" });

    const res = await createCommentAction({ reportId, ...base });

    expect(res).toEqual({ ok: false, error: "read_only_view_as" });
    const page = await listCommentsForReport(getDb(), { reportId, viewerId: null, sort: "newest", limit: 10, offset: 0 });
    expect(page).toHaveLength(0);
  });

  it("a signed-out caller → not_signed_in", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    const res = await createCommentAction({ reportId, ...base });
    expect(res).toEqual({ ok: false, error: "not_signed_in" });
  });

  it("an empty body → the db 'empty' refusal surfaces", async () => {
    signInAs({ id: "clerk_commenter", role: "user" });
    const res = await createCommentAction({ reportId: "any", body: "   ", displayAttribution: "display_name" });
    expect(res).toEqual({ ok: false, error: "empty" });
  });

  it("an over-length body → 'too_long'", async () => {
    signInAs({ id: "clerk_commenter", role: "user" });
    const res = await createCommentAction({
      reportId: "any",
      body: "x".repeat(2001),
      displayAttribution: "display_name",
    });
    expect(res).toEqual({ ok: false, error: "too_long" });
  });
});

describe("editCommentAction / deleteCommentAction", () => {
  // Post a comment as clerk_commenter and return its id.
  async function postComment(reportId: string): Promise<string> {
    signInAs({ id: "clerk_commenter", role: "user" });
    await createCommentAction({ reportId, ...base });
    const [c] = await listCommentsForReport(getDb(), { reportId, viewerId: null, sort: "newest", limit: 10, offset: 0 });
    return c!.id;
  }

  it("author edits their own comment", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    const commentId = await postComment(reportId);

    const res = await editCommentAction({ reportId, commentId, body: "Edited: still a great loop." });

    expect(res).toEqual({ ok: true });
  });

  it("edit refuses while impersonating", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    const commentId = await postComment(reportId);
    signInAs({ id: "clerk_admin", role: "admin" });
    calls.cookieJar.set(VIEW_AS_COOKIE, { value: "some-target-id" });

    const res = await editCommentAction({ reportId, commentId, body: "sneaky edit" });
    expect(res).toEqual({ ok: false, error: "read_only_view_as" });
  });

  it("author soft-deletes their own comment", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    const commentId = await postComment(reportId);

    const res = await deleteCommentAction({ reportId, commentId });

    expect(res.ok).toBe(true);
  });

  it("delete refuses while impersonating", async () => {
    const { reportId } = await seedReport({ ownerClerkId: "clerk_owner" });
    const commentId = await postComment(reportId);
    signInAs({ id: "clerk_admin", role: "admin" });
    calls.cookieJar.set(VIEW_AS_COOKIE, { value: "some-target-id" });

    const res = await deleteCommentAction({ reportId, commentId });
    expect(res).toEqual({ ok: false });
  });
});
