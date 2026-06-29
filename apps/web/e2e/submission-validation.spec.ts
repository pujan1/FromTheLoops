import { expect, test } from "@playwright/test";
import { fillBasics, signIn, startRound } from "./helpers";

// Error path for the submission form's client-side gate: the "Share experience"
// button stays disabled until the WHOLE submission validates, and a "finish the
// highlighted rounds" hint explains why. This is the guard that stops a
// half-built report ever reaching finalize. Complements abuse.spec.ts (which
// covers a *valid-shaped* submission rejected server-side).
//
// Requires the gated E2E env (CLERK_SECRET_KEY + a seeded DB).

test("an incomplete submission keeps Submit disabled with a blocked hint", async ({
  page,
}) => {
  await signIn(page);

  await fillBasics(page, { company: "Stripe", companyQuery: "stri" });
  // A round with a type + rating but NO question/topic — below the
  // ≥1-active-tag finalize rule, so the submission is invalid.
  await startRound(page);

  const submit = page.getByRole("button", { name: "Share experience" });
  await expect(submit).toBeDisabled();
  // The hint only renders once a round exists, so seeing it confirms we're
  // blocked on the question, not just on an empty form.
  await expect(
    page.getByText(/finish the highlighted rounds and questions/i),
  ).toBeVisible();

  // Completing the round (question + an active topic tag) flips the gate.
  await page.getByRole("button", { name: "Add question" }).click();
  await page
    .getByRole("textbox", { name: "What were you asked?" })
    .fill("Two-sum variant on a stream.");
  const topics = page.getByRole("combobox", { name: "Topics", exact: true });
  await topics.click();
  await topics.fill("arra");
  await page.getByRole("option", { name: "Arrays" }).first().click();

  // Now valid → the button enables. We stop here: not finalizing keeps the
  // per-company Stripe slot free for report-lifecycle.spec.ts.
  await expect(submit).toBeEnabled();
});
