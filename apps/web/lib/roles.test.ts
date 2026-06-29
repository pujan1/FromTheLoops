import { describe, expect, it } from "vitest";
import { isRole, roleAtLeast, ROLES } from "./roles";

// The role ladder gates every /admin and moderation surface. A bug here is a
// privilege-escalation bug, so the ordering and the validity check are pinned.

describe("isRole", () => {
  it("accepts every declared role", () => {
    for (const role of ROLES) {
      expect(isRole(role)).toBe(true);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    // A bad publicMetadata.role must NOT be trusted as a real role — it has to
    // fall through to the `user` floor in resolveRole.
    expect(isRole("superadmin")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(3)).toBe(false);
    expect(isRole({ role: "admin" })).toBe(false);
  });
});

describe("roleAtLeast", () => {
  it("is inclusive upward — higher privilege clears a lower bar", () => {
    expect(roleAtLeast("admin", "moderator")).toBe(true);
    expect(roleAtLeast("super_admin", "user")).toBe(true);
    expect(roleAtLeast("moderator", "moderator")).toBe(true);
  });

  it("refuses when the caller is below the bar", () => {
    expect(roleAtLeast("user", "moderator")).toBe(false);
    expect(roleAtLeast("moderator", "admin")).toBe(false);
    expect(roleAtLeast("admin", "super_admin")).toBe(false);
  });
});
