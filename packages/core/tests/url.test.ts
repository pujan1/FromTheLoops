// Canonical URL contract (Sprint 4): pure path builders (no DB) + the db-backed
// slug→entity resolvers, exercised against a real Postgres like the other core
// suites. The resolvers' job is to fail (return null → the route 404s) at the
// first missing/inactive segment, and to hand back the AggregateCellKey keyed
// on the level's display name.

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  resolveCompany,
  resolveCompanyRole,
  resolveTopic,
  resolveTopicCompany,
  resolveUser,
  resolveWedge,
} from "../src/index.js";
import {
  companiesPath,
  companyPath,
  companyRolePath,
  reportPath,
  topicCompanyPath,
  topicPath,
  topicsPath,
  userPath,
  wedgePath,
} from "@fromtheloop/shared";
import {
  companies,
  companyLevels,
  type Database,
  getOrCreateUserByClerkId,
  roles,
  schema,
  topics,
  users,
} from "@fromtheloop/db";

describe("url path builders (pure)", () => {
  it("build the canonical browse paths", () => {
    expect(companiesPath()).toBe("/companies");
    expect(companyPath("stripe")).toBe("/companies/stripe");
    expect(companyRolePath("stripe", "backend")).toBe("/companies/stripe/backend");
    expect(wedgePath("stripe", "backend", "l4")).toBe("/companies/stripe/backend/l4");
    expect(reportPath("abc-123")).toBe("/reports/abc-123");
    expect(topicsPath()).toBe("/topics");
    expect(topicPath("rate-limiting")).toBe("/topics/rate-limiting");
    expect(topicCompanyPath("rate-limiting", "stripe")).toBe(
      "/topics/rate-limiting/stripe",
    );
    expect(userPath("alice_loops")).toBe("/u/alice_loops");
  });

  it("encode path segments defensively", () => {
    expect(wedgePath("stripe", "backend", "sde ii")).toBe(
      "/companies/stripe/backend/sde%20ii",
    );
    expect(topicCompanyPath("a/b", "c d")).toBe("/topics/a%2Fb/c%20d");
  });
});

describe("url resolvers (db-backed)", () => {
  let db: Database;
  let client: ReturnType<typeof postgres>;
  let companyId: string;
  let roleId: string;
  let userId: string;

  beforeAll(async () => {
    client = postgres(inject("databaseUrl"), {
      max: 4,
      prepare: false,
      onnotice: () => {},
    });
    db = drizzle(client, { schema });

    userId = (await getOrCreateUserByClerkId(db, { clerkId: "clerk_url_user" })).id;
    await db
      .update(users)
      .set({ username: "urluser", displayName: "Url User" })
      .where(eq(users.id, userId));

    companyId = (
      await db
        .insert(companies)
        .values({ slug: "urlco", name: "UrlCo", status: "active" })
        .returning({ id: companies.id })
    )[0]!.id;
    await db
      .insert(companyLevels)
      .values({ companyId, slug: "l4", name: "L4", orderIndex: 0 });
    // A pending company is not a public, resolvable page.
    await db
      .insert(companies)
      .values({ slug: "urlco-pending", name: "PendCo", status: "pending" });
    roleId = (
      await db
        .insert(roles)
        .values({ slug: "urlswe", name: "Url SWE", status: "active" })
        .returning({ id: roles.id })
    )[0]!.id;
    await db
      .insert(topics)
      .values({ slug: "urltopic", name: "Url Topic", status: "active" });
    // A pending topic is not a public, resolvable page.
    await db
      .insert(topics)
      .values({ slug: "urltopic-pending", name: "PendTopic", status: "pending" });
  });

  afterAll(async () => {
    await db.delete(companyLevels).where(eq(companyLevels.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(companies).where(eq(companies.slug, "urlco-pending"));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.delete(topics).where(eq(topics.slug, "urltopic"));
    await db.delete(topics).where(eq(topics.slug, "urltopic-pending"));
    await db.delete(users).where(eq(users.id, userId));
    await client.end({ timeout: 5 });
  });

  it("resolveCompany resolves active, nulls on missing/pending", async () => {
    expect((await resolveCompany(db, "urlco"))?.company.id).toBe(companyId);
    expect(await resolveCompany(db, "urlco-pending")).toBeNull();
    expect(await resolveCompany(db, "nope")).toBeNull();
  });

  it("resolveCompanyRole fails fast on a bad company or role", async () => {
    const ok = await resolveCompanyRole(db, "urlco", "urlswe");
    expect(ok?.company.id).toBe(companyId);
    expect(ok?.role.id).toBe(roleId);
    expect(await resolveCompanyRole(db, "urlco", "no-role")).toBeNull();
    expect(await resolveCompanyRole(db, "no-co", "urlswe")).toBeNull();
  });

  it("resolveWedge returns the cell keyed on the level display name", async () => {
    const w = await resolveWedge(db, "urlco", "urlswe", "l4");
    expect(w).not.toBeNull();
    expect(w!.level.slug).toBe("l4");
    expect(w!.cell).toEqual({
      companyId,
      canonicalRoleId: roleId,
      level: "L4", // display name, not the slug
    });
    // Unknown level slug → 404 source.
    expect(await resolveWedge(db, "urlco", "urlswe", "l99")).toBeNull();
  });

  it("resolveTopic resolves active, nulls on missing/pending", async () => {
    expect((await resolveTopic(db, "urltopic"))?.topic.slug).toBe("urltopic");
    expect(await resolveTopic(db, "urltopic-pending")).toBeNull();
    expect(await resolveTopic(db, "nope")).toBeNull();
  });

  it("resolveTopicCompany fails fast on a bad topic or company", async () => {
    const ok = await resolveTopicCompany(db, "urltopic", "urlco");
    expect(ok?.topic.slug).toBe("urltopic");
    expect(ok?.company.id).toBe(companyId);
    expect(await resolveTopicCompany(db, "urltopic", "no-co")).toBeNull();
    expect(await resolveTopicCompany(db, "no-topic", "urlco")).toBeNull();
    // A pending company isn't a public page even with a valid topic.
    expect(await resolveTopicCompany(db, "urltopic", "urlco-pending")).toBeNull();
  });

  it("resolveUser resolves a known handle, nulls on an unknown one", async () => {
    const ok = await resolveUser(db, "urluser");
    expect(ok?.user.id).toBe(userId);
    expect(ok?.user.displayName).toBe("Url User");
    expect(await resolveUser(db, "ghost")).toBeNull();
  });
});
