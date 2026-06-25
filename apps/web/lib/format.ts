// Shared time formatting. The same "3h ago" relative clock and the same
// absolute "Jun 24, 2026, 3:14 PM" hover string were copy-pasted across the
// admin surfaces (audit, health, mod-queue); this is the one definition they
// all read from. Pure functions, safe to import in client components.

// Accepts a Date or an ISO string (server passes Date; serialized props arrive
// as strings over the RSC boundary).
function toDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input);
}

// Compact relative age: "12s ago" → "5m ago" → "3h ago" → "8d ago".
export function relativeTime(input: Date | string): string {
  const seconds = Math.round((Date.now() - toDate(input).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Full local timestamp — used for the title/hover behind a relative age.
export function absoluteTime(input: Date | string): string {
  return toDate(input).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
