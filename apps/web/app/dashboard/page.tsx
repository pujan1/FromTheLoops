import { currentUser } from "@clerk/nextjs/server";
import { getDb, getOrCreateUserByClerkId } from "@fromtheloop/db";

export default async function DashboardPage() {
  // Middleware already gates this route, so currentUser() is non-null here.
  const user = await currentUser();
  if (!user) {
    // Belt-and-suspenders: middleware should have redirected. If we got here
    // without a user, surface it loudly rather than rendering a broken page.
    throw new Error("dashboard: middleware did not gate unauthenticated request");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? null;
  // Upsert-on-visit: guarantees a `users` row for the Clerk principal so FKs
  // (reports, drafts, …) resolve. Webhook sync is deferred — see TODO below.
  await getOrCreateUserByClerkId(getDb(), { clerkId: user.id, email });

  return (
    <main style={{ padding: "4rem 2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Dashboard</h1>
      <p style={{ color: "var(--color-ink-2)" }}>
        Signed in as <strong>{email ?? user.id}</strong>.
      </p>
      <p style={{ marginTop: "1rem", color: "var(--color-muted)", fontSize: "0.875rem" }}>
        Clerk id <code>{user.id}</code> upserted into <code>users</code>.
      </p>
      {/* TODO(sprint-1): replace upsert-on-visit with Clerk webhook
          (user.created / user.updated → /api/webhooks/clerk). Needs ngrok
          tunnel for local dev and a CLERK_WEBHOOK_SECRET env var. */}
    </main>
  );
}
