// Karma tier badges (Sprint 5 Day 8) — the vanity 10 / 100 / 1000 rungs
// (PLAN.md §Karma "vanity badges (10/100/1000 tiers)"). Pure presentation logic:
// it maps a karma total to the highest tier reached, so it lives in core (no db,
// no React) and is shared by the profile header today and any author byline
// later. The earn RULE (how karma accrues) is a backend invariant and lives in
// @fromtheloop/db; this is only how the resulting number is labelled.

export interface KarmaTier {
  // The threshold this tier starts at — also a stable key for styling/sorting.
  threshold: 10 | 100 | 1000;
  // The badge label shown to readers.
  label: string;
}

// Ascending; karmaTier walks it from the top so the highest reached tier wins.
export const KARMA_TIERS: readonly KarmaTier[] = [
  { threshold: 10, label: "Contributor" },
  { threshold: 100, label: "Established" },
  { threshold: 1000, label: "Distinguished" },
] as const;

// The highest tier a karma total has reached, or null below the first rung (10).
// Negative/zero karma never has a tier. A non-integer is floored implicitly by
// the >= comparison against integer thresholds.
export function karmaTier(karma: number): KarmaTier | null {
  for (let i = KARMA_TIERS.length - 1; i >= 0; i--) {
    const tier = KARMA_TIERS[i]!;
    if (karma >= tier.threshold) return tier;
  }
  return null;
}
