import { expect, test } from "@playwright/test";

// Error paths for the public read surfaces: a slug or id that resolves to
// nothing must 404, not 200-with-empty-shell (SEO + no confusing blank pages).
// Each page calls notFound() when its lookup misses. The bad-level slug case
// lives in browse.spec.ts ("a bad level slug 404s"); this covers the rest of
// the resolvable surfaces. Public — no auth needed.
//
// A random uuid is enough for the report case: getPublicReportDetail misses and
// there's no signed-in author to fall through to, so the page notFound()s.

const MISSES: Array<{ label: string; path: string }> = [
  {
    label: "unknown company",
    path: "/companies/this-company-does-not-exist",
  },
  { label: "unknown role under a real company", path: "/companies/amazon/not-a-real-role" },
  {
    label: "unknown report id",
    path: `/reports/${"00000000-0000-0000-0000-000000000000"}`,
  },
  { label: "unknown username", path: "/u/no-such-user-xyz-999" },
  { label: "unknown topic", path: "/topics/not-a-real-topic-slug" },
];

for (const { label, path } of MISSES) {
  test(`${label} → 404 (${path})`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
  });
}
