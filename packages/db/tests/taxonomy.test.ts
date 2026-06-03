// Taxonomy lookup correctness + the p95 latency budget.
//
// Exit criteria exercised here:
//   - "Typing 'stri' suggests 'Stripe' (curated) within 150ms p95"
//   - "Typing 'MyTinyCo' with no match offers 'Suggest new'; submission
//     creates companies.status = 'pending'"
//   - "Role autocomplete has NO 'create new' affordance" (asserted by the
//     module surface: there is no suggestRole export — see note below)
//
// Uses the shared testcontainer via makeTestClient (like seed.test). The
// trigram indexes the benchmark leans on come from migration 0002, applied
// by tests/global-setup.ts. No truncate in beforeAll (exclusive lock blocks
// behind other suites' connections); isolation is by source-filtered
// cleanup in afterAll, same as seed.test.

import { eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, companyLevels, roles, topics } from "../src/schema/index.js";
import { seedCurated } from "../src/seed/curated.js";
import {
  getCompanyLevels,
  searchCompanies,
  searchRoles,
  searchTopics,
  suggestCompany,
  suggestTopic,
} from "../src/taxonomy.js";
import { makeTestClient, type TestDb } from "./helpers.js";

// Slug a suggested-pending test row collides on nothing in the curated set.
const SUGGESTED_SLUG = "mytinyco-inc";
const SUGGESTED_TOPIC_SLUG = "rust-async-internals";

describe("taxonomy lookup", () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const { db: d, client } = makeTestClient();
    db = d;
    close = () => client.end({ timeout: 5 });
    await seedCurated(db);
  });

  afterAll(async () => {
    // Drop our rows so they don't collide with other suites (DELETE by
    // source, not TRUNCATE — avoids the exclusive lock). Also remove the
    // pending company suggestCompany created.
    await db
      .delete(companyLevels)
      .where(eq(companyLevels.source, "seed_curated"));
    await db
      .delete(companies)
      .where(
        or(eq(companies.source, "seed_curated"), eq(companies.slug, SUGGESTED_SLUG)),
      );
    await db.delete(roles).where(eq(roles.source, "seed_curated"));
    await db
      .delete(topics)
      .where(
        or(
          eq(topics.source, "seed_curated"),
          eq(topics.slug, SUGGESTED_TOPIC_SLUG),
        ),
      );
    await close();
  });

  describe("searchCompanies", () => {
    it("suggests Stripe for the prefix 'stri'", async () => {
      const matches = await searchCompanies(db, "stri");
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.name).toBe("Stripe");
      expect(matches[0]?.slug).toBe("stripe");
      expect(matches[0]?.domain).toBe("stripe.com");
    });

    it("matches on aliases ('Facebook' → Meta)", async () => {
      const matches = await searchCompanies(db, "Facebook");
      expect(matches[0]?.name).toBe("Meta");
    });

    it("tolerates a typo ('googel' → Google)", async () => {
      const matches = await searchCompanies(db, "googel");
      expect(matches.some((m) => m.slug === "google")).toBe(true);
    });

    it("returns nothing for an empty/whitespace query", async () => {
      expect(await searchCompanies(db, "")).toEqual([]);
      expect(await searchCompanies(db, "   ")).toEqual([]);
    });

    it("respects the limit option", async () => {
      // 'i' appears in many company names; cap the dropdown.
      const matches = await searchCompanies(db, "i", { limit: 3 });
      expect(matches.length).toBeLessThanOrEqual(3);
    });

    it("excludes pending companies from results", async () => {
      await suggestCompany(db, { name: "MyTinyCo Inc" });
      const matches = await searchCompanies(db, "MyTinyCo");
      expect(matches).toEqual([]);
    });
  });

  describe("searchRoles", () => {
    it("matches canonical role names ('machine' → Machine Learning Engineer)", async () => {
      const matches = await searchRoles(db, "machine");
      expect(matches[0]?.slug).toBe("ml");
    });

    it("matches role aliases ('SDET' → QA Engineer)", async () => {
      const matches = await searchRoles(db, "SDET");
      expect(matches.some((m) => m.slug === "qa")).toBe(true);
    });

    it("returns nothing for an empty query", async () => {
      expect(await searchRoles(db, "")).toEqual([]);
    });
  });

  describe("searchTopics", () => {
    it("matches curated topic names ('dynamic' → Dynamic Programming)", async () => {
      const matches = await searchTopics(db, "dynamic");
      expect(matches[0]?.slug).toBe("dynamic-programming");
    });

    it("matches topic aliases ('K8s' → Kubernetes)", async () => {
      const matches = await searchTopics(db, "K8s");
      expect(matches.some((m) => m.slug === "kubernetes")).toBe(true);
    });

    it("tolerates a typo ('kubernets' → Kubernetes)", async () => {
      const matches = await searchTopics(db, "kubernets");
      expect(matches.some((m) => m.slug === "kubernetes")).toBe(true);
    });

    it("returns nothing for an empty query", async () => {
      expect(await searchTopics(db, "")).toEqual([]);
    });

    it("excludes pending topics from results", async () => {
      await suggestTopic(db, { name: "Rust Async Internals" });
      const matches = await searchTopics(db, "Rust Async Internals");
      expect(matches).toEqual([]);
    });
  });

  describe("suggestTopic", () => {
    it("creates a pending, user_suggested topic", async () => {
      // Idempotent across the suite: the excludes-pending test may have
      // created it already, so assert the resulting row, not `created`.
      const { topic } = await suggestTopic(db, { name: "Rust Async Internals" });
      expect(topic.slug).toBe(SUGGESTED_TOPIC_SLUG);
      expect(topic.name).toBe("Rust Async Internals");
      expect(topic.status).toBe("pending");
      expect(topic.source).toBe("user_suggested");
    });

    it("is idempotent on the slug (created=false on repeat)", async () => {
      const again = await suggestTopic(db, { name: "Rust Async Internals" });
      expect(again.created).toBe(false);
      expect(again.topic.slug).toBe(SUGGESTED_TOPIC_SLUG);
    });

    it("never flips an existing active topic back to pending", async () => {
      const { topic, created } = await suggestTopic(db, { name: "Caching" });
      expect(created).toBe(false);
      expect(topic.slug).toBe("caching");
      expect(topic.status).toBe("active");
    });

    it("rejects an empty name", async () => {
      await expect(suggestTopic(db, { name: "   " })).rejects.toThrow();
    });
  });

  describe("suggestCompany", () => {
    it("creates a pending, user_suggested company", async () => {
      // Idempotent across the suite: the excludes-pending test may have
      // created it already, so assert the resulting row, not `created`.
      const { company } = await suggestCompany(db, { name: "MyTinyCo Inc" });
      expect(company.slug).toBe(SUGGESTED_SLUG);
      expect(company.name).toBe("MyTinyCo Inc");
      expect(company.status).toBe("pending");
      expect(company.source).toBe("user_suggested");
    });

    it("is idempotent on the slug (created=false on repeat)", async () => {
      const again = await suggestCompany(db, { name: "MyTinyCo Inc" });
      expect(again.created).toBe(false);
      expect(again.company.slug).toBe(SUGGESTED_SLUG);
    });

    it("never flips an existing active company back to pending", async () => {
      const { company, created } = await suggestCompany(db, { name: "Stripe" });
      expect(created).toBe(false);
      expect(company.slug).toBe("stripe");
      expect(company.status).toBe("active");
    });

    it("rejects an empty name", async () => {
      await expect(suggestCompany(db, { name: "   " })).rejects.toThrow();
    });
  });

  describe("getCompanyLevels", () => {
    it("returns the company ladder in order_index order", async () => {
      const [stripe] = await searchCompanies(db, "stripe");
      expect(stripe).toBeDefined();
      const levels = await getCompanyLevels(db, stripe!.id);
      // Curated Stripe ladder is L1..L5 in order.
      expect(levels.map((l) => l.name)).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    });

    it("returns [] for a company with no ladder (e.g. a suggested one)", async () => {
      const { company } = await suggestCompany(db, { name: "MyTinyCo Inc" });
      const levels = await getCompanyLevels(db, company.id);
      expect(levels).toEqual([]);
    });
  });

  it("meets the p95 < 150ms budget for 'stri' lookup", async () => {
    const ITERATIONS = 50;
    const durations: number[] = [];
    // Warm-up: first query pays plan/connection cost we don't want in p95.
    await searchCompanies(db, "stri");
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      await searchCompanies(db, "stri");
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(0.95 * ITERATIONS) - 1];
    // Generous headroom vs. the 150ms budget — at seed scale this is ~1ms;
    // the index keeps it flat as the taxonomy grows. Asserting the budget
    // (not the observed value) guards against an accidental seqscan regress.
    expect(p95).toBeLessThan(150);
  });
});
