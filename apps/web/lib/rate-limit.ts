// Per-user rate limiting.
//
// The submission surfaces are authenticated but were previously unthrottled.
// The sharpest consequence: `suggestPendingCompany` writes straight into a
// human moderation queue, one row per unique slug, with no backpressure — a
// single account past Clerk's captcha could flood it. This module is the
// per-user budget that guards those surfaces.
//
// Mechanism: a fixed-window counter in Redis (INCR + EXPIRE on first hit).
// Atomic enough for abuse control and cheap (one round trip per call). Keys
// are namespaced per policy + principal and expire on their own, so there's
// no cleanup job.
//
// Fail-open: if Redis is unreachable we allow the call (and log once) rather
// than take down submissions over a cache hiccup. These limits protect a mod
// queue, not authentication, so availability wins the trade. Sentry still
// sees the error via the logged warning.

import Redis from "ioredis";

let client: Redis | null = null;
let warnedUnavailable = false;

function getClient(): Redis | null {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  // lazyConnect + a low retry ceiling so a dead Redis fails fast into the
  // fail-open path instead of hanging the request.
  client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  client.on("error", () => {
    // Swallow connection errors here; callers handle the throw from the
    // command itself and fail open. Without this listener ioredis emits
    // unhandled 'error' events.
  });
  return client;
}

export interface RateLimitPolicy {
  // Stable name; namespaces the Redis key so policies don't collide.
  name: string;
  // Max allowed actions per window.
  limit: number;
  // Window length in seconds.
  windowSeconds: number;
}

// Named policies, tuned per surface. Autosave is legitimately frequent
// (2s debounce → ~30/min from one tab) so its budget is generous and only
// exists to cap write amplification. Company suggestions feed a human queue,
// so that budget is deliberately tight.
export const RATE_LIMITS = {
  saveDraft: { name: "save-draft", limit: 120, windowSeconds: 60 },
  suggestCompany: { name: "suggest-company", limit: 10, windowSeconds: 3600 },
} satisfies Record<string, RateLimitPolicy>;

export interface RateLimitResult {
  ok: boolean;
  // Remaining actions in the current window (>= 0). -1 when unknown
  // (fail-open path).
  remaining: number;
}

// Consume one unit of `policy`'s budget for `principal` (use a stable id —
// the Clerk user id — so the limit applies before any DB work). Returns
// ok=false when the window's budget is exhausted.
export async function rateLimit(
  policy: RateLimitPolicy,
  principal: string,
): Promise<RateLimitResult> {
  const redis = getClient();
  if (!redis) return { ok: true, remaining: -1 };

  const key = `rl:${policy.name}:${principal}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      // First hit in this window — start the TTL.
      await redis.expire(key, policy.windowSeconds);
    }
    const remaining = Math.max(0, policy.limit - count);
    return { ok: count <= policy.limit, remaining };
  } catch (err) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn(
        `rateLimit: Redis unavailable, failing open for ${policy.name}`,
        err,
      );
    }
    return { ok: true, remaining: -1 };
  }
}

// Thrown by guarded actions when the budget is exhausted. The message is
// safe to surface to the client.
export class RateLimitError extends Error {
  constructor(public readonly policy: RateLimitPolicy) {
    super("Rate limit exceeded. Please slow down and try again shortly.");
    this.name = "RateLimitError";
  }
}
