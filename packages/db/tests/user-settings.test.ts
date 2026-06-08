// User settings / account-delete / export reads (Sprint 5, Day 6).
//
// Covers the four data-layer pieces behind /settings:
//   - updateUserSettings: display-name normalization + default attribution
//   - deleteUserAccount: soft-delete the account, cascade-soft-delete its
//     reports, drop its drafts; idempotent
//   - purgeDeletedUserPii: the worker's 90-day scrub of deleted accounts
//   - getUserDataExport: the "export my data" JSON dump shape
//
// Taxonomy is isolated by this suite's own slugs and torn down in afterAll;
// reports/drafts/verifications are cleared in beforeEach so each case starts
// from a known state.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  companies,
  createReport,
  deleteUserAccount,
  drafts,
  getOrCreateUserByClerkId,
  getUserById,
  getUserDataExport,
  interviewReports,
  purgeDeletedUserPii,
  type ReportWriteInput,
  roles,
  topics,
  updateUserSettings,
  userVerifications,
  users,
} from "../src/index.js";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("user settings / delete / export", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let aliceId: string;
  let bobId: string; // second author, so cross-author rows never get touched
  let companyAId: string;
  let companyBId: string;
  let sweId: string;
  let topicId: string;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });

    aliceId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_set_alice", email: "alice@x.com" })).id;
    bobId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_set_bob", email: "bob@x.com" })).id;
    await db.update(users).set({ username: "alice_set" }).where(eq(users.id, aliceId));
    await db.update(users).set({ username: "bob_set" }).where(eq(users.id, bobId));

    companyAId = (
      await db.insert(companies).values({ slug: "setco-a", name: "SetCo A", status: "active" }).returning({ id: companies.id })
    )[0]!.id;
    companyBId = (
      await db.insert(companies).values({ slug: "setco-b", name: "SetCo B", status: "active" }).returning({ id: companies.id })
    )[0]!.id;
    sweId = (
      await db.insert(roles).values({ slug: "set-swe", name: "Set SWE", status: "active" }).returning({ id: roles.id })
    )[0]!.id;
    topicId = (
      await db.insert(topics).values({ slug: "set-arrays", name: "Arrays", status: "active" }).returning({ id: topics.id })
    )[0]!.id;
  });

  afterAll(async () => {
    await db.delete(userVerifications).where(inArray(userVerifications.userId, [aliceId, bobId]));
    await db.delete(drafts).where(inArray(drafts.userId, [aliceId, bobId]));
    await db.delete(interviewReports).where(inArray(interviewReports.companyId, [companyAId, companyBId]));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db.delete(roles).where(eq(roles.id, sweId));
    await db.delete(companies).where(inArray(companies.id, [companyAId, companyBId]));
    await db.delete(users).where(inArray(users.id, [aliceId, bobId]));
    await close();
  });

  beforeEach(async () => {
    await db.delete(drafts).where(inArray(drafts.userId, [aliceId, bobId]));
    await db.delete(userVerifications).where(inArray(userVerifications.userId, [aliceId, bobId]));
    await db.delete(interviewReports).where(inArray(interviewReports.companyId, [companyAId, companyBId]));
    // Reset every field the delete/purge cases mutate — including the identity
    // columns the PII purge nulls out — so each case starts from a clean row.
    await db
      .update(users)
      .set({
        deletedAt: null,
        piiPurgedAt: null,
        displayName: null,
        defaultDisplayAttribution: "anonymous",
        clerkId: "clerk_set_alice",
        username: "alice_set",
        email: "alice@x.com",
      })
      .where(eq(users.id, aliceId));
    await db
      .update(users)
      .set({
        deletedAt: null,
        piiPurgedAt: null,
        displayName: null,
        defaultDisplayAttribution: "anonymous",
        clerkId: "clerk_set_bob",
        username: "bob_set",
        email: "bob@x.com",
      })
      .where(eq(users.id, bobId));
  });

  async function makeReport(overrides: Partial<ReportWriteInput> = {}): Promise<string> {
    const input: ReportWriteInput = {
      createdByUserId: aliceId,
      companyId: companyAId,
      canonicalRoleId: sweId,
      level: "L4",
      levelId: null,
      interviewMonth: "2026-02",
      outcome: "offer",
      displayAttribution: "anonymous",
      status: "active",
      rounds: [
        {
          roundType: "onsite-coding",
          rating: "positive",
          experienceProse: "Solid loop.",
          questions: [{ prose: "Two-sum variant.", topicIds: [topicId] }],
        },
      ],
      ...overrides,
    };
    const { id } = await createReport(db, input);
    return id;
  }

  // ---- updateUserSettings ----

  it("updateUserSettings trims a display name and sets the default attribution", async () => {
    const updated = await updateUserSettings(db, aliceId, {
      displayName: "  Alice L.  ",
      defaultDisplayAttribution: "display_name",
    });
    expect(updated?.displayName).toBe("Alice L.");
    expect(updated?.defaultDisplayAttribution).toBe("display_name");
  });

  it("updateUserSettings normalizes an empty display name to null", async () => {
    await updateUserSettings(db, aliceId, { displayName: "Temp" });
    const cleared = await updateUserSettings(db, aliceId, { displayName: "   " });
    expect(cleared?.displayName).toBeNull();
  });

  it("updateUserSettings leaves untouched fields alone on a partial update", async () => {
    await updateUserSettings(db, aliceId, { displayName: "Keep Me", defaultDisplayAttribution: "display_name" });
    // Update only the attribution; the name must survive.
    const after = await updateUserSettings(db, aliceId, { defaultDisplayAttribution: "anonymous" });
    expect(after?.displayName).toBe("Keep Me");
    expect(after?.defaultDisplayAttribution).toBe("anonymous");
  });

  // ---- deleteUserAccount ----

  it("deleteUserAccount soft-deletes the account, its reports, and its drafts", async () => {
    const activeId = await makeReport();
    const pendingId = await makeReport({ status: "pending_moderation" });
    await db.insert(drafts).values({ userId: aliceId, data: { company: { name: "X" } } });
    const bobReportId = await makeReport({ createdByUserId: bobId });

    const result = await deleteUserAccount(db, aliceId);
    expect(result).toEqual({ reportsDeleted: 2, alreadyDeleted: false, found: true });

    // Account stamped.
    const alice = await getUserById(db, aliceId);
    expect(alice?.deletedAt).not.toBeNull();

    // Both her reports flipped to deleted (active + pending).
    const reportStatuses = await db
      .select({ id: interviewReports.id, status: interviewReports.status })
      .from(interviewReports)
      .where(inArray(interviewReports.id, [activeId, pendingId]));
    expect(reportStatuses.every((r) => r.status === "deleted")).toBe(true);

    // Drafts gone.
    const remainingDrafts = await db.select().from(drafts).where(eq(drafts.userId, aliceId));
    expect(remainingDrafts).toHaveLength(0);

    // Bob's report is untouched.
    const bob = await db.select({ status: interviewReports.status }).from(interviewReports).where(eq(interviewReports.id, bobReportId));
    expect(bob[0]?.status).toBe("active");
  });

  it("deleteUserAccount is idempotent — a second call is a no-op", async () => {
    await makeReport();
    const first = await deleteUserAccount(db, aliceId);
    expect(first.alreadyDeleted).toBe(false);
    expect(first.reportsDeleted).toBe(1);

    const second = await deleteUserAccount(db, aliceId);
    expect(second).toEqual({ reportsDeleted: 0, alreadyDeleted: true, found: true });
  });

  it("deleteUserAccount reports found=false for an unknown id", async () => {
    const result = await deleteUserAccount(db, "00000000-0000-0000-0000-000000000000");
    expect(result).toEqual({ reportsDeleted: 0, alreadyDeleted: false, found: false });
  });

  // ---- purgeDeletedUserPii ----

  it("purgeDeletedUserPii scrubs accounts deleted before the cutoff, skips recent ones", async () => {
    // Alice deleted 100 days ago → due. Bob deleted just now → not due.
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    await db.update(users).set({ deletedAt: hundredDaysAgo, displayName: "Alice" }).where(eq(users.id, aliceId));
    await db.update(users).set({ deletedAt: new Date(), displayName: "Bob" }).where(eq(users.id, bobId));

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const { usersPurged } = await purgeDeletedUserPii(db, cutoff);
    expect(usersPurged).toBe(1);

    const alice = await getUserById(db, aliceId);
    expect(alice?.email).toBeNull();
    expect(alice?.username).toBeNull();
    expect(alice?.displayName).toBeNull();
    expect(alice?.clerkId).toBeNull();
    expect(alice?.piiPurgedAt).not.toBeNull();

    // Bob (recent delete) untouched.
    const bob = await getUserById(db, bobId);
    expect(bob?.displayName).toBe("Bob");
    expect(bob?.piiPurgedAt).toBeNull();
  });

  it("purgeDeletedUserPii is idempotent and ignores live accounts", async () => {
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    await db.update(users).set({ deletedAt: hundredDaysAgo }).where(eq(users.id, aliceId));
    // Bob is NOT deleted at all → must never be scrubbed.

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    expect((await purgeDeletedUserPii(db, cutoff)).usersPurged).toBe(1);
    // Second pass: alice already has pii_purged_at → skipped.
    expect((await purgeDeletedUserPii(db, cutoff)).usersPurged).toBe(0);

    const bob = await getUserById(db, bobId);
    expect(bob?.email).toBe("bob@x.com");
  });

  // ---- getUserDataExport ----

  it("getUserDataExport returns the full account + report tree + drafts + verifications", async () => {
    await db.update(users).set({ displayName: "Alice L.", defaultDisplayAttribution: "display_name" }).where(eq(users.id, aliceId));
    await makeReport({ displayAttribution: "display_name" });
    await makeReport({ companyId: companyBId, status: "pending_moderation" }); // owner sees pending too
    await db.insert(drafts).values({ userId: aliceId, data: { company: { name: "Draft Co" } } });
    await db.insert(userVerifications).values({
      userId: aliceId,
      companyId: companyAId,
      verifiedVia: "work_email",
      evidenceTokenHash: "hash-x",
    });

    const dump = await getUserDataExport(db, aliceId);
    expect(dump).not.toBeNull();
    if (!dump) return;

    expect(dump.account.username).toBe("alice_set");
    expect(dump.account.displayName).toBe("Alice L.");
    expect(dump.account.email).toBe("alice@x.com");
    expect(dump.account.defaultDisplayAttribution).toBe("display_name");

    // Both reports (active + pending) appear, with their round/question tree.
    expect(dump.reports).toHaveLength(2);
    const withRounds = dump.reports.find((r) => r.rounds.length > 0);
    expect(withRounds?.rounds[0]?.questions[0]?.prose).toBe("Two-sum variant.");
    expect(withRounds?.rounds[0]?.questions[0]?.topics).toContain("Arrays");

    expect(dump.drafts).toHaveLength(1);
    expect(dump.verifications).toHaveLength(1);
    expect(dump.verifications[0]?.company).toBe("SetCo A");
    // The evidence hash is NOT in the export.
    expect(JSON.stringify(dump)).not.toContain("hash-x");
  });

  it("getUserDataExport returns null for an unknown user", async () => {
    expect(await getUserDataExport(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
