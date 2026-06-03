// Verifies the Sprint 1 Day 2 curated fixtures land correctly and that the
// seed is idempotent. Uses the shared testcontainer (makeTestClient) like
// the rest of the suite — seedCurated() takes any Drizzle db, so the test
// client works without needing process.env.DATABASE_URL.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, companyLevels, roles, topics } from "../src/schema/index.js";
import {
  CURATED_COMPANIES,
  CURATED_ROLES,
  CURATED_TOPICS,
  seedCurated,
} from "../src/seed/curated.js";
import { makeTestClient, type TestDb } from "./helpers.js";

describe("curated seed", () => {
  let db: TestDb;
  let close: () => Promise<void>;

  // No truncate here: TRUNCATE takes an exclusive lock and blocks behind
  // other suites' connections to the shared container. Not needed anyway —
  // only this seed produces source = 'seed_curated' rows, so the
  // source-filtered counts below are exact regardless of leftover data.
  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    await seedCurated(db);
  });

  afterAll(async () => {
    // Clean up our rows so they don't collide with other suites that insert
    // the same slugs (e.g. constraints.test inserts a "swe" role). DELETE by
    // source — not TRUNCATE, which takes an exclusive lock and can block
    // behind other suites' connections to the shared container.
    await db
      .delete(companyLevels)
      .where(eq(companyLevels.source, "seed_curated"));
    await db.delete(companies).where(eq(companies.source, "seed_curated"));
    await db.delete(roles).where(eq(roles.source, "seed_curated"));
    await db.delete(topics).where(eq(topics.source, "seed_curated"));
    await close();
  });

  it("ships the agreed taxonomy size (30 companies, 20 roles, ~80 topics)", () => {
    expect(CURATED_COMPANIES).toHaveLength(30);
    expect(CURATED_ROLES).toHaveLength(20);
    // "~80 tags across SWE/ML/data/SRE" — assert the floor, not an exact
    // count, so the curated set can grow without breaking the test.
    expect(CURATED_TOPICS.length).toBeGreaterThanOrEqual(80);
  });

  it("has unique company, role, and topic slugs", () => {
    const companySlugs = CURATED_COMPANIES.map((c) => c.slug);
    const roleSlugs = CURATED_ROLES.map((r) => r.slug);
    const topicSlugs = CURATED_TOPICS.map((t) => t.slug);
    expect(new Set(companySlugs).size).toBe(companySlugs.length);
    expect(new Set(roleSlugs).size).toBe(roleSlugs.length);
    expect(new Set(topicSlugs).size).toBe(topicSlugs.length);
  });

  it("inserts every curated company as active + seed_curated", async () => {
    const rows = await db
      .select()
      .from(companies)
      .where(eq(companies.source, "seed_curated"));
    expect(rows).toHaveLength(CURATED_COMPANIES.length);
    expect(rows.every((r) => r.status === "active")).toBe(true);
    const stripe = rows.find((r) => r.slug === "stripe");
    expect(stripe?.domain).toBe("stripe.com");
  });

  it("inserts every curated role as active + seed_curated", async () => {
    const rows = await db
      .select()
      .from(roles)
      .where(eq(roles.source, "seed_curated"));
    expect(rows).toHaveLength(CURATED_ROLES.length);
    expect(rows.every((r) => r.status === "active")).toBe(true);
  });

  it("inserts every curated topic as active + seed_curated", async () => {
    const rows = await db
      .select()
      .from(topics)
      .where(eq(topics.source, "seed_curated"));
    expect(rows).toHaveLength(CURATED_TOPICS.length);
    expect(rows.every((r) => r.status === "active")).toBe(true);
  });

  it("gives every curated company an ordered, dense-from-0 level ladder", async () => {
    const companyRows = await db
      .select()
      .from(companies)
      .where(eq(companies.source, "seed_curated"));
    for (const company of companyRows) {
      const levels = await db
        .select()
        .from(companyLevels)
        .where(eq(companyLevels.companyId, company.id));
      expect(levels.length).toBeGreaterThan(0);
      const orders = levels.map((l) => l.orderIndex).sort((a, b) => a - b);
      expect(orders).toEqual(orders.map((_, i) => i));
    }
  });

  it("is idempotent — re-running does not duplicate", async () => {
    await seedCurated(db);
    await seedCurated(db);

    const companyRows = await db
      .select()
      .from(companies)
      .where(eq(companies.source, "seed_curated"));
    const roleRows = await db
      .select()
      .from(roles)
      .where(eq(roles.source, "seed_curated"));
    const levelRows = await db
      .select()
      .from(companyLevels)
      .where(eq(companyLevels.source, "seed_curated"));
    const topicRows = await db
      .select()
      .from(topics)
      .where(eq(topics.source, "seed_curated"));

    const expectedLevels = CURATED_COMPANIES.reduce(
      (sum, c) => sum + c.levels.length,
      0,
    );
    expect(companyRows).toHaveLength(CURATED_COMPANIES.length);
    expect(roleRows).toHaveLength(CURATED_ROLES.length);
    expect(levelRows).toHaveLength(expectedLevels);
    expect(topicRows).toHaveLength(CURATED_TOPICS.length);
  });
});
