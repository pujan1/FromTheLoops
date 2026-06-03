import { clerk } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { E2E_EMAIL } from "./global.setup";

// End-to-end submission flow (Sprint 1 Day 9). Exercises the exit criteria
// that need a real authed browser session — the loop the earlier days
// deferred here because Clerk's sign-up Turnstile loops for an automated
// browser (clerkSetup's testing token bypasses it).
//
//   login → fill top-level fields → autosave → leave (reload) → resume →
//   continue → Rounds stub
//
// Plus the Day 8 honeypot rejection path.

const DRAFT_URL = /\/drafts\/[0-9a-f-]{36}$/;

// Sign in via Clerk's email-ticket strategy (no password round-trip). Requires
// a page that has loaded Clerk first, hence the goto("/").
async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
}

// Drive the custom <Combobox>: focus, type the query, click the matching
// option, and confirm the input committed to the option's label.
async function fillCombobox(
  page: Page,
  label: string,
  query: string,
  optionName: string,
): Promise<void> {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.click();
  await input.fill(query);
  await page.getByRole("option", { name: optionName }).first().click();
  await expect(input).toHaveValue(optionName);
}

test("login → fill → leave → resume → continue", async ({ page }) => {
  await signIn(page);

  await page.goto("/submit");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Top-level fields, all backed by the seeded taxonomy.
  await fillCombobox(page, "Company", "stri", "Stripe");
  await fillCombobox(page, "Role", "software engineer", "Software Engineer");

  // The only native <select> on the page is the per-company level ladder.
  const levelSelect = page.locator("select");
  await levelSelect.selectOption({ index: 1 }); // index 0 is the placeholder
  const chosenLevel = await levelSelect.inputValue();
  expect(chosenLevel).not.toBe("");

  // Autosave: 2s after the last change the first save creates the draft and
  // shallow-rewrites the URL to /drafts/[id].
  await page.waitForURL(DRAFT_URL, { timeout: 15_000 });
  const draftUrl = page.url();
  // Let the debounced autosave persist this latest (level) change before we
  // leave — 2s debounce + the save round-trip.
  await page.waitForTimeout(3_000);

  // Leave & return: a hard reload resumes the draft via the RSC route.
  await page.reload();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByRole("combobox", { name: "Company", exact: true })).toHaveValue("Stripe");
  await expect(page.getByRole("combobox", { name: "Role", exact: true })).toHaveValue("Software Engineer");
  await expect(page.locator("select")).toHaveValue(chosenLevel);

  // Continue → the Sprint 2 Rounds stub.
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/submit\/rounds$/);
});

test("suggest-new company → continue creates a pending taxonomy row", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/submit");

  // A name with no taxonomy match → the Combobox offers a suggest-new row.
  const companyName = "E2E PendingCo";
  const companyInput = page.getByRole("combobox", {
    name: "Company",
    exact: true,
  });
  await companyInput.click();
  await companyInput.fill(companyName);
  await page.getByRole("option", { name: /Suggest/ }).click();
  await expect(companyInput).toHaveValue(companyName);

  // Suggested company has no level ladder → the form records it as N/A, so the
  // only remaining required field is the role.
  await fillCombobox(page, "Role", "software engineer", "Software Engineer");

  // Continue promotes the suggestion to a status='pending' row server-side,
  // backfills the id, and advances to the Rounds stub.
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/submit\/rounds$/);
});

test("a tripped honeypot is silently dropped — no draft is created", async ({
  page,
}) => {
  await signIn(page);

  await page.goto("/submit");
  await expect(page.getByRole("combobox", { name: "Company", exact: true })).toBeVisible();

  // A bot fills the off-screen decoy a human can never reach.
  await page
    .locator('input[name="website"]')
    .fill("http://spam.example", { force: true });

  // A real field change now triggers an autosave that carries the honeypot.
  await fillCombobox(page, "Company", "stri", "Stripe");

  // Past the 2s debounce + the save round-trip: the action dropped the write,
  // so no draft id came back and the URL never advanced to /drafts/[id].
  await page.waitForTimeout(6_000);
  await expect(page).toHaveURL(/\/submit$/);
});
