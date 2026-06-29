import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// auth() (Clerk) and notFound() (Next) are the two edges admin.ts touches. We
// mock both: auth feeds in a synthetic session, notFound throws a sentinel so a
// "should be 404'd" assertion is unambiguous (the real notFound throws too).
const auth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => auth() }));

class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

import {
  adminClerkIds,
  getRole,
  isAdminClerkId,
  requireAdmin,
  requireRole,
} from "./admin";

// A signed-in session whose validated metadata role is `role` (or none).
const session = (userId: string | null, role?: string) => ({
  userId,
  sessionClaims: role ? { metadata: { role } } : {},
});

const ORIGINAL_ENV = process.env.ADMIN_CLERK_IDS;

afterEach(() => {
  process.env.ADMIN_CLERK_IDS = ORIGINAL_ENV;
  vi.clearAllMocks();
});

describe("adminClerkIds / isAdminClerkId", () => {
  it("parses the comma-separated allowlist, trimming blanks", () => {
    process.env.ADMIN_CLERK_IDS = " user_a , user_b ,, ";
    expect(adminClerkIds()).toEqual(["user_a", "user_b"]);
  });

  it("returns [] when unset and never matches a null id", () => {
    delete process.env.ADMIN_CLERK_IDS;
    expect(adminClerkIds()).toEqual([]);
    expect(isAdminClerkId(null)).toBe(false);
    expect(isAdminClerkId(undefined)).toBe(false);
  });

  it("matches an id present in the allowlist", () => {
    process.env.ADMIN_CLERK_IDS = "user_break_glass";
    expect(isAdminClerkId("user_break_glass")).toBe(true);
    expect(isAdminClerkId("user_other")).toBe(false);
  });
});

describe("getRole", () => {
  beforeEach(() => {
    delete process.env.ADMIN_CLERK_IDS;
  });

  it("returns 'user' when signed out", async () => {
    auth.mockResolvedValue(session(null));
    expect(await getRole()).toBe("user");
  });

  it("reads a validated metadata role", async () => {
    auth.mockResolvedValue(session("user_1", "moderator"));
    expect(await getRole()).toBe("moderator");
  });

  it("falls back to 'user' for an unrecognized metadata role (untrusted input)", async () => {
    auth.mockResolvedValue(session("user_1", "wizard"));
    expect(await getRole()).toBe("user");
  });

  it("break-glass allowlist wins over metadata — resolves super_admin", async () => {
    process.env.ADMIN_CLERK_IDS = "user_1";
    auth.mockResolvedValue(session("user_1", "user"));
    expect(await getRole()).toBe("super_admin");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    delete process.env.ADMIN_CLERK_IDS;
  });

  it("returns the caller's id when they clear the bar", async () => {
    auth.mockResolvedValue(session("user_1", "admin"));
    expect(await requireRole("moderator")).toBe("user_1");
  });

  it("404s a signed-out caller", async () => {
    auth.mockResolvedValue(session(null));
    await expect(requireRole("moderator")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s an under-privileged caller (a 404, not a 403 — route existence isn't advertised)", async () => {
    auth.mockResolvedValue(session("user_1", "moderator"));
    await expect(requireAdmin()).rejects.toBeInstanceOf(NotFoundError);
  });
});
