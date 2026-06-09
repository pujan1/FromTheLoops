import { expect, test } from "@playwright/test";

// The role-primary browse journey (Sprint 4 Day 10 exit criterion). Public, no
// auth — these are the pages Google indexes and a logged-out visitor lands on.
// Asserts against the deterministic seed (pnpm db:seed:reports): Amazon ·
// Software Engineer, with a dense SDE II level (15) and a thin SDE III (8).
//
// Resilient where it can be (roles by accessible name, reports by href shape)
// and exact where the seed is fixed (the SDE II swap + sparse SDE III banner).

const REPORT_URL = /\/reports\/[0-9a-f-]{36}$/;

test.describe("browse journey (role-primary)", () => {
  test("companies index → company → role page", async ({ page }) => {
    await page.goto("/companies");
    await expect(
      page.getByRole("heading", { level: 1, name: /browse companies/i }),
    ).toBeVisible();

    // Into the company: a cross-role feed + role navigation, not a tile list.
    await page.getByRole("link", { name: /^Amazon/ }).first().click();
    await expect(page).toHaveURL(/\/companies\/amazon$/);
    await expect(page.getByText(/reports across \d+ roles/i)).toBeVisible();

    // Role nav → the role page (the canonical money page).
    await page.getByRole("link", { name: /Software Engineer/ }).first().click();
    await expect(page).toHaveURL(/\/companies\/amazon\/swe$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /Software Engineer · Amazon/ }),
    ).toBeVisible();
    // Position Y (role aggregate over all levels) is present.
    await expect(page.getByText(/outcome distribution/i)).toBeVisible();
    // The report list spans levels (a card carries its own level).
    await expect(page.locator('a[href^="/reports/"]').first()).toBeVisible();
  });

  test("level facet swaps Position Y to the dense level cell", async ({ page }) => {
    await page.goto("/companies/amazon/swe");
    // Click the SDE II level chip in the filter bar (located by its facet href).
    await page.locator('a[href*="level=sde-ii"]').first().click();
    await expect(page).toHaveURL(/[?&]level=sde-ii/);
    // Dense level → headline scoped to the level, Position Y still rendered.
    await expect(page.getByText(/reports at SDE II/i)).toBeVisible();
    await expect(page.getByText(/outcome distribution/i)).toBeVisible();
  });

  test("a thin level path broadens with a sparse banner", async ({ page }) => {
    // SDE III is below the threshold → role aggregate + the small-sample note.
    await page.goto("/companies/amazon/swe/sde-iii");
    await expect(page.getByText(/small sample/i)).toBeVisible();
    await expect(
      page.getByText(/Only \d+ reports? at the Amazon · Software Engineer · SDE III/i),
    ).toBeVisible();
  });

  test("a bad level slug 404s", async ({ page }) => {
    const res = await page.goto("/companies/amazon/swe/l99");
    expect(res?.status()).toBe(404);
  });

  test("a report card opens its detail page", async ({ page }) => {
    await page.goto("/companies/amazon/swe");
    await page.locator('a[href^="/reports/"]').first().click();
    await expect(page).toHaveURL(REPORT_URL);
  });

  test("header search returns results", async ({ page }) => {
    await page.goto("/companies/amazon/swe");
    const search = page.getByLabel("Search interview reports").first();
    await search.fill("system design");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=system/);
    await expect(page.getByText(/reports for/i)).toBeVisible();
  });
});

// ADR-0010 — the desktop master-detail triage pane. Desktop Chrome (1280px) is
// ≥1024px, so the pane is active. These assert the pane layers ON TOP of the list
// (no round-trip, list stays), shallow-updates the URL to the real /reports/:id,
// walks the ordered set with prev/next, closes on Esc, and hands off to the
// canonical SSR page via "Open full report".
test.describe("triage pane (desktop master-detail)", () => {
  const openFull = (page: import("@playwright/test").Page) =>
    page.getByRole("link", { name: /open full report/i });

  test("a row click previews in the pane without leaving the list", async ({
    page,
  }) => {
    await page.goto("/companies/amazon/swe");
    await page.locator('a[href^="/reports/"]').first().click();

    // URL shallow-updates to the real report address (shareable, refresh-safe)…
    await expect(page).toHaveURL(REPORT_URL);
    // …but the list is still here (no navigation): the filter bar + master cards
    // remain, and the pane's "Open full report" handoff is showing.
    await expect(page.locator('a[href^="/reports/"]').first()).toBeVisible();
    await expect(openFull(page)).toBeVisible();
  });

  test("prev/next steps through the ordered set in the pane", async ({
    page,
  }) => {
    await page.goto("/companies/amazon/swe");
    await page.locator('a[href^="/reports/"]').first().click();
    await expect(page).toHaveURL(REPORT_URL);
    const first = new URL(page.url()).pathname;

    await page.getByRole("button", { name: "Next report" }).click();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .not.toBe(first);
    await expect(page).toHaveURL(REPORT_URL);

    // Back one → returns to the first report.
    await page.getByRole("button", { name: "Previous report" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(first);
  });

  test("Esc closes the pane back to the list URL", async ({ page }) => {
    await page.goto("/companies/amazon/swe");
    await page.locator('a[href^="/reports/"]').first().click();
    await expect(page).toHaveURL(REPORT_URL);

    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/companies\/amazon\/swe$/);
    await expect(openFull(page)).toBeHidden();
  });

  test("Open full report hands off to the canonical SSR page", async ({
    page,
  }) => {
    await page.goto("/companies/amazon/swe");
    await page.locator('a[href^="/reports/"]').first().click();
    await expect(openFull(page)).toBeVisible();

    await openFull(page).click();
    // A real navigation to the per-report page (the pane's prev/next is gone).
    await expect(page).toHaveURL(REPORT_URL);
    await expect(
      page.getByRole("button", { name: "Next report" }),
    ).toHaveCount(0);
  });
});
