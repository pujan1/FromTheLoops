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
  resolveWedge,
} from "../src/index.js";
import {
  companiesPath,
  companyPath,
  companyRolePath,
  reportPath,
  wedgePath,
} from "@fromtheloop/shared";
import {
  companies,
  companyLevels,
  type Database,
  roles,
  schema,
} from "@fromtheloop/db";

describe("url path builders (pure)", () => {
  it("build the canonical browse paths", () => {
    expect(companiesPath()).toBe("/companies");
    expect(companyPath("stripe")).toBe("/companies/stripe");
    expect(companyRolePath("stripe", "backend")).toBe("/companies/stripe/backend");
    expect(wedgePath("stripe", "backend", "l4")).toBe("/companies/stripe/backend/l4");
    expect(reportPath("abc-123")).toBe("/reports/abc-123");
  });

  it("encode path segments defensively", () => {
    expect(wedgePath("stripe", "backend", "sde ii")).toBe(
      "/companies/stripe/backend/sde%20ii",
    );
  });
});

describe("url resolvers (db-backed)", () => {
  let db: Database;
  let client: ReturnType<typeof postgres>;
  let companyId: string;
  let roleId: string;

  beforeAll(async () => {
    client = postgres(inject("databaseUrl"), {
      max: 4,
      prepare: false,
      onnotice: () => {},
    });
    db = drizzle(client, { schema });

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
  });

  afterAll(async () => {
    await db.delete(companyLevels).where(eq(companyLevels.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(companies).where(eq(companies.slug, "urlco-pending"));
    await db.delete(roles).where(eq(roles.id, roleId));
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
});
