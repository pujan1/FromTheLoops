// Time units and small time helpers shared across the db package. Keeps the
// `24 * 60 * 60 * 1000` magic number defined exactly once instead of re-derived
// inline in each module.

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

// Whole days from now until `deadline`, clamped at 0 (never negative). Used for
// "days left before X" countdowns — e.g. the PII-purge window in the soft-delete
// queue.
export function daysUntil(deadline: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / DAY_MS));
}
