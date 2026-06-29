import type { Role } from "@/lib/roles";

type MockUser = {
  id: string;
  primaryEmailAddress?: { emailAddress?: string };
} | null;

// The current "request": who auth()/currentUser() report. Mutated by signInAs().
export const session = {
  userId: null as string | null,
  role: "user" as Role,
  user: null as MockUser,
};

// Side effects the actions produce, captured for assertions.
export const calls = {
  revalidatedPaths: [] as string[],
  cookieJar: new Map<string, { value: string; opts?: unknown }>(),
  enqueuedJobs: [] as { name: string; data: unknown; opts?: unknown }[],
};

// Rate-limit verdict the mocked @/lib/rate-limit returns. Default allow; a test
// flips `allow` to drive the over-budget branch.
export const rateLimitState = { allow: true };

export function signInAs(opts: { id: string; role: Role; email?: string }): void {
  session.userId = opts.id;
  session.role = opts.role;
  session.user = {
    id: opts.id,
    primaryEmailAddress: { emailAddress: opts.email ?? `${opts.id}@test.dev` },
  };
}

export function signOut(): void {
  session.userId = null;
  session.role = "user";
  session.user = null;
}

export function resetEdges(): void {
  signOut();
  calls.revalidatedPaths.length = 0;
  calls.cookieJar.clear();
  calls.enqueuedJobs.length = 0;
  rateLimitState.allow = true;
}

// Tagged stand-ins for Next's control-flow throws, so tests can assert "this
// path bailed via notFound()/redirect()" the same way the framework unwinds.
export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.name = "RedirectError";
  }
}
