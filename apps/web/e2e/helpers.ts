import { clerk } from "@clerk/testing/playwright";
import { expect, type Page } from "@playwright/test";
import { E2E_EMAIL } from "./global.setup";

// Shared E2E helpers for the submission flow. Kept separate from any single
// spec so the report-lifecycle and abuse specs drive the form the same way.

export const REPORT_URL = /\/reports\/[0-9a-f-]{36}$/;

// Sign in via Clerk's email-ticket strategy (no password round-trip). Requires
// a page that has loaded Clerk first, hence the goto("/").
export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
}

// Drive the custom <Combobox>: focus, type the query, click the matching
// option, confirm the input committed to the option's label.
export async function fillCombobox(
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

// Fill the basics screen with a seeded company + role + the first real level,
// then Continue to the Rounds screen.
export async function fillBasics(
  page: Page,
  opts: { company: string; companyQuery: string },
): Promise<void> {
  await page.goto("/submit");
  await fillCombobox(page, "Company", opts.companyQuery, opts.company);
  await fillCombobox(page, "Role", "software engineer", "Software Engineer");
  // The only native <select> on the basics page is the per-company level ladder.
  await page.locator("select").selectOption({ index: 1 }); // index 0 = placeholder
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/submit\/rounds$/);
}

// Add one round (type + rating) with a single question (prose + one active
// topic tag) on the Rounds screen. `topic` must be a seeded active topic so it
// satisfies the ≥1-active-tag finalize rule.
export async function addRoundWithQuestion(
  page: Page,
  opts: { prose: string; topic: string; topicQuery: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add your first round" }).click();
  // Round type — the only <select> on the Rounds screen.
  await page.locator("select").selectOption("onsite-coding");
  // Rating chips are visually-hidden radios; force-click past the a11y hiding.
  await page.getByRole("radio", { name: "Positive" }).click({ force: true });

  await page.getByRole("button", { name: "Add question" }).click();
  await page
    .getByRole("textbox", { name: "What were you asked?" })
    .fill(opts.prose);
  await fillCombobox(page, "Topics", opts.topicQuery, opts.topic);
}
