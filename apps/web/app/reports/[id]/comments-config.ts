// Shared comment constants. Kept out of comment-actions.ts because a
// "use server" module may only export async functions — a plain const there is
// a Next.js build error. Imported by both the server actions and the SSR page.

// SSR first-page size + the "Load more" page size (ADR-0011: SSR ~first 15).
export const COMMENTS_PAGE_SIZE = 15;

// Client-safe mirror of the db's COMMENT_MAX_LENGTH (packages/db/src/comments.ts).
// Duplicated here so the composer (a client component) can show a char limit
// without importing the Node-only db package into the browser bundle. The
// SERVER is the source of truth — this is only a UI hint; keep the two in sync.
export const COMMENT_MAX_LENGTH = 2000;
