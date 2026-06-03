import { expect, test } from "@playwright/test";
import {
  addRoundWithQuestion,
  fillBasics,
  REPORT_URL,
  signIn,
} from "./helpers";

// Day 10 happy path: the full submission lifecycle through a real authed
// browser — submit a complete report, land on its owner view, enter the edit
// flow, then soft-delete it. Deleting at the end frees the per-company slot
// (1 report/company/user) so the suite is rerunnable against the same test
// user.
//
// Uses seeded taxonomy: Stripe (company), Software Engineer (role), Arrays
// (topic). Requires the gated E2E env (CLERK_SECRET_KEY + a seeded DB).

test("submit → land on report → edit → soft-delete", async ({ page }) => {
  await signIn(page);

  await fillBasics(page, { company: "Stripe", companyQuery: "stri" });
  await addRoundWithQuestion(page, {
    prose: "Reverse a linked list in place.",
    topic: "Arrays",
    topicQuery: "arra",
  });

  // Submit becomes enabled once the whole submission validates; finalize routes
  // to the new report's owner view.
  await page.getByRole("button", { name: "Submit report" }).click();
  await page.waitForURL(REPORT_URL, { timeout: 20_000 });
  const reportUrl = page.url();

  // Owner view shows the company · role heading and the in-review status.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Stripe");
  await expect(page.getByText(/in review/i)).toBeVisible();

  // Edit CTA (inside the 24h window) rehydrates the report into the form.
  await page.getByRole("button", { name: "Edit report" }).click();
  await expect(page).toHaveURL(/\/submit\/rounds\?draft=/);

  // Back to the report, then soft-delete. The confirm() dialog must be accepted.
  await page.goto(reportUrl);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete report" }).click();

  // The view re-renders into its deleted state; Edit/Delete are gone.
  await expect(page.getByText(/report deleted/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete report" }),
  ).toHaveCount(0);
});
