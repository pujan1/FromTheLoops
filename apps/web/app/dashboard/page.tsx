import { currentUser } from "@clerk/nextjs/server";
import { getDb, sql, users } from "@fromtheloop/db";

// Upsert-on-visit user sync. Clerk owns identity; this guarantees a `users`
// row exists for the signed-in Clerk principal so FKs in interview_reports,
// mod_action_logs, etc. resolve. Webhook-based sync (user.created /
// user.updated) is deferred — see TODO below.
async function syncUser(clerkId: string, email: string | null) {
  const db = getDb();
  await db
    .insert(users)
    .values({ clerkId, email })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email: sql`excluded.email` },
    });
}

export default async function DashboardPage() {
  // Middleware already gates this route, so currentUser() is non-null here.
  const user = await currentUser();
  if (!user) {
    // Belt-and-suspenders: middleware should have redirected. If we got here
    // without a user, surface it loudly rather than rendering a broken page.
    throw new Error("dashboard: middleware did not gate unauthenticated request");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? null;
  await syncUser(user.id, email);

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
