// RBAC role model (Sprint 6 Day 1). The four-tier ladder that gates /admin and,
// from here on, the moderation surfaces. Source of truth is Clerk
// publicMetadata.role — set server-side, surfaced to the app via the session
// token (see the CustomJwtSessionClaims augmentation below). The DB users.role
// column stays deferred: auth decisions read Clerk, not Postgres.
//
// The decision record for the whole RBAC + evidence + audit design is ADR-0008
// (written Sprint 6 Day 10, once evidence storage + audit log are also settled).

export const ROLES = ["user", "moderator", "admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

// Strictly increasing privilege. roleAtLeast() compares on this, so a check for
// "moderator" is satisfied by admin and super_admin too.
const RANK: Record<Role, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// Does `role` clear the `min` bar? Privilege is inclusive upward.
export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

// Clerk ships an empty CustomJwtSessionClaims interface for apps to augment.
// Adding `metadata.role` here types `(await auth()).sessionClaims.metadata.role`
// across the app. It only carries a value if the Clerk session token is
// configured to include the claim — Dashboard → Sessions → Customize session
// token:  { "metadata": "{{user.public_metadata}}" }
// Without that step the claim is absent and everyone resolves to `user` (the
// env allowlist still grants super_admin — see lib/admin.ts), which is a safe
// default rather than a lockout.
declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: Role;
    };
  }
}
