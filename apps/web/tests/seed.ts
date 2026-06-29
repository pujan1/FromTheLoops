import { createReport, getDb, getOrCreateUserByClerkId, schema, sql, type User } from "@fromtheloop/db";

let counter = 0;

export async function makeUser(clerkId: string): Promise<User> {
  return getOrCreateUserByClerkId(getDb(), { clerkId, email: `${clerkId}@test.dev` });
}

export interface SeededReport {
  owner: User;
  companyId: string;
  roleId: string;
  reportId: string;
}

export async function seedReport(opts: {
  ownerClerkId: string;
  status?: "active" | "pending_moderation" | "deleted";
  lockedInPast?: boolean;
}): Promise<SeededReport> {
  const db = getDb();
  const n = ++counter;
  const owner = await makeUser(opts.ownerClerkId);

  const [company] = await db
    .insert(schema.companies)
    .values({ slug: `acme-${n}`, name: `Acme ${n}` })
    .returning();
  const [role] = await db
    .insert(schema.roles)
    .values({ slug: `swe-${n}`, name: `Software Engineer ${n}` })
    .returning();

  const { id: reportId } = await createReport(db, {
    createdByUserId: owner.id,
    companyId: company!.id,
    canonicalRoleId: role!.id,
    level: "L4",
    levelId: null,
    interviewMonth: "2026-01",
    outcome: "offer",
    displayAttribution: "display_name",
    status: opts.status ?? "active",
    rounds: [
      {
        roundType: "onsite-coding",
        rating: "positive",
        experienceProse: "Two LeetCode-mediums, friendly interviewer.",
        questions: [],
      },
    ],
  });

  // Backdate the edit window for "window closed" cases (default is now()+24h).
  if (opts.lockedInPast) {
    await db.execute(
      sql`UPDATE interview_reports SET locked_at = now() - interval '1 hour' WHERE id = ${reportId}`,
    );
  }

  return { owner, companyId: company!.id, roleId: role!.id, reportId };
}

// Owner-scoped status read, for asserting a delete took / didn't take effect.
export async function reportStatus(reportId: string): Promise<string | null> {
  const rows = await getDb().execute<{ status: string }>(
    sql`SELECT status FROM interview_reports WHERE id = ${reportId}`,
  );
  return rows[0]?.status ?? null;
}
