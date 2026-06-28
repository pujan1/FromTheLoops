// Pure karma → badge mapping (the earn rule lives in @fromtheloop/db).

export interface KarmaTier {
  threshold: 10 | 100 | 1000;
  label: string;
}

// Ascending; karmaTier walks from the top so the highest reached tier wins.
export const KARMA_TIERS: readonly KarmaTier[] = [
  { threshold: 10, label: "Contributor" },
  { threshold: 100, label: "Established" },
  { threshold: 1000, label: "Distinguished" },
] as const;

// Highest tier reached, or null below 10.
export function karmaTier(karma: number): KarmaTier | null {
  for (let i = KARMA_TIERS.length - 1; i >= 0; i--) {
    const tier = KARMA_TIERS[i]!;
    if (karma >= tier.threshold) return tier;
  }
  return null;
}
