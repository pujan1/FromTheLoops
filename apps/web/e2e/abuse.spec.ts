import { expect, test } from "@playwright/test";
import { addRoundWithQuestion, fillBasics, signIn } from "./helpers";

// Day 10 abuse path: the regex block list at submit time (sprint exit
// criterion: "Submitting 'call me at 555-1234' is rejected with the regex
// block"). The honeypot drop path lives in submission.spec.ts; the per-company
// cap and rate limit are covered by core/db integration tests (driving 2+ full
// submissions through the browser is brittle and slow).
//
// Requires the gated E2E env (CLERK_SECRET_KEY + a seeded DB).

test("a submission with contact info in the prose is rejected", async ({
  page,
}) => {
  await signIn(page);

  await fillBasics(page, { company: "Stripe", companyQuery: "stri" });
  // Valid shape (so the client-side Submit enables), but the prose carries a
  // phone number — the server-side block list rejects it at finalize.
  await addRoundWithQuestion(page, {
    prose: "They told me to call me at 555-1234 to schedule.",
    topic: "Arrays",
    topicQuery: "arra",
  });

  await page.getByRole("button", { name: "Share experience" }).click();

  // Finalize returns a "blocked" error; the form shows the notice and stays put
  // (no navigation to a /reports/[id] page, so nothing was written).
  await expect(
    page.getByText(/contact info or personal details/i),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/submit\/rounds/);
});
