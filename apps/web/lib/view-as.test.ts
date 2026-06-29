import { afterEach, describe, expect, it, vi } from "vitest";

// view-as.ts is read-only admin impersonation. The security-critical contract:
// getImpersonation re-checks the admin role on EVERY read, so a non-admin who
// hand-sets the cookie sees nothing. We mock the three edges it touches.
const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: cookieGet }),
}));

const getRole = vi.fn();
vi.mock("./admin", () => ({ getRole: () => getRole() }));

const getUserById = vi.fn();
vi.mock("@fromtheloop/db", () => ({ getUserById: (...a: unknown[]) => getUserById(...a) }));

import { VIEW_AS_COOKIE } from "./view-as-cookie";
import { assertNotImpersonating, getImpersonation, getViewAsTargetId } from "./view-as";

const db = {} as never; // never reached — getUserById is mocked
const setCookie = (value: string | undefined) =>
  cookieGet.mockReturnValue(value === undefined ? undefined : { value });
const TARGET = { id: "u_target", username: "neo", displayName: "Neo" };

afterEach(() => vi.clearAllMocks());

describe("getViewAsTargetId", () => {
  it("returns the raw cookie value, or null when absent", async () => {
    setCookie("u_target");
    expect(await getViewAsTargetId()).toBe("u_target");
    setCookie(undefined);
    expect(await getViewAsTargetId()).toBeNull();
  });

  it("reads the shared cookie name", async () => {
    setCookie("u_target");
    await getViewAsTargetId();
    expect(cookieGet).toHaveBeenCalledWith(VIEW_AS_COOKIE);
  });
});

describe("getImpersonation", () => {
  it("returns the target when an admin has the cookie set", async () => {
    setCookie("u_target");
    getRole.mockResolvedValue("admin");
    getUserById.mockResolvedValue(TARGET);
    expect(await getImpersonation(db)).toEqual({
      targetUserId: "u_target",
      username: "neo",
      displayName: "Neo",
    });
  });

  it("returns null for a non-admin even with the cookie set (re-check on every read)", async () => {
    setCookie("u_target");
    getRole.mockResolvedValue("user");
    expect(await getImpersonation(db)).toBeNull();
    // Never even hits the DB once the role check fails.
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("returns null when no cookie is set", async () => {
    setCookie(undefined);
    expect(await getImpersonation(db)).toBeNull();
    expect(getRole).not.toHaveBeenCalled();
  });

  it("returns null on a stale cookie pointing at a deleted user", async () => {
    setCookie("u_gone");
    getRole.mockResolvedValue("admin");
    getUserById.mockResolvedValue(undefined);
    expect(await getImpersonation(db)).toBeNull();
  });
});

describe("assertNotImpersonating", () => {
  it("throws while a view-as cookie is present (blocks writes mid-impersonation)", async () => {
    setCookie("u_target");
    await expect(assertNotImpersonating()).rejects.toThrow(/view as/i);
  });

  it("is a no-op with no cookie", async () => {
    setCookie(undefined);
    await expect(assertNotImpersonating()).resolves.toBeUndefined();
  });
});
