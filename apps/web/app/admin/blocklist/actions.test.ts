// Phase 4 action integration test — the editable blocklist CRUD actions.
//
// Real Postgres (Testcontainers via tests/setup.ts), Clerk + next/cache mocked.
// What pure lib tests can't see and this proves: the admin gate fires server-
// side (not just in the UI), the BlocklistError → {ok:false} mapping holds, a
// bad category is coerced, idempotent no-ops report "not found", and a refused
// call writes nothing to the DB.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, listBlocklist } from "@fromtheloop/db";
import {
  createBlocklistEntry,
  deleteBlocklistEntry,
  toggleBlocklistEntry,
} from "./actions";
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

describe("createBlocklistEntry", () => {
  it("admin adds an entry → persisted + queue revalidated", async () => {
    signInAs({ id: "clerk_admin", role: "admin" });

    const res = await createBlocklistEntry({
      pattern: "badword",
      label: "Slur A",
      category: "slur",
    });

    expect(res).toEqual({ ok: true });
    const rows = await listBlocklist(getDb());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pattern: "badword", label: "Slur A", category: "slur" });
    expect(calls.revalidatedPaths).toContain("/admin/blocklist");
  });

  it("an unknown category is coerced to 'other'", async () => {
    signInAs({ id: "clerk_admin", role: "admin" });

    await createBlocklistEntry({ pattern: "x", label: "L", category: "not-a-category" });

    const [row] = await listBlocklist(getDb());
    expect(row!.category).toBe("other");
  });

  it("an invalid regex → {ok:false} with no row written", async () => {
    signInAs({ id: "clerk_admin", role: "admin" });

    const res = await createBlocklistEntry({ pattern: "(", label: "L", category: "spam" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/invalid regex/i);
    expect(await listBlocklist(getDb())).toHaveLength(0);
  });

  it("a moderator (below the admin bar) is refused → notFound, nothing written", async () => {
    signInAs({ id: "clerk_mod", role: "moderator" });

    await expect(
      createBlocklistEntry({ pattern: "y", label: "L", category: "spam" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await listBlocklist(getDb())).toHaveLength(0);
    expect(calls.revalidatedPaths).toHaveLength(0);
  });

  it("a signed-out caller is refused → notFound", async () => {
    await expect(
      createBlocklistEntry({ pattern: "z", label: "L", category: "spam" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await listBlocklist(getDb())).toHaveLength(0);
  });
});

describe("toggleBlocklistEntry / deleteBlocklistEntry", () => {
  async function seedEntry(): Promise<string> {
    signInAs({ id: "clerk_admin", role: "admin" });
    await createBlocklistEntry({ pattern: "seed", label: "Seed", category: "spam" });
    const [row] = await listBlocklist(getDb());
    return row!.id;
  }

  it("toggle disables an existing entry", async () => {
    const id = await seedEntry();

    const res = await toggleBlocklistEntry(id, false);

    expect(res).toEqual({ ok: true });
    const [row] = await listBlocklist(getDb());
    expect(row!.enabled).toBe(false);
  });

  it("toggle of a missing id → {ok:false, not found}", async () => {
    signInAs({ id: "clerk_admin", role: "admin" });
    const res = await toggleBlocklistEntry("00000000-0000-0000-0000-000000000000", false);
    expect(res).toEqual({ ok: false, error: "Entry not found." });
  });

  it("delete removes the entry", async () => {
    const id = await seedEntry();

    const res = await deleteBlocklistEntry(id);

    expect(res).toEqual({ ok: true });
    expect(await listBlocklist(getDb())).toHaveLength(0);
  });

  it("delete is admin-gated too", async () => {
    const id = await seedEntry();
    signInAs({ id: "clerk_mod", role: "moderator" });

    await expect(deleteBlocklistEntry(id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listBlocklist(getDb())).toHaveLength(1);
  });
});
