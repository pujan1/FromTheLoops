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
  // Topic suggestions feed the same human moderation queue as companies, so
  // the same tight budget applies. A question can carry several tags, so this
  // is a touch more generous than companies (one company per report).
  suggestTopic: { name: "suggest-topic", limit: 20, windowSeconds: 3600 },
  // Finalizing a report is the heaviest write surface (a multi-row transaction)
  // and the one whose output becomes user-visible content. 10/day per user
  // matches the sprint's submission cap. Enforced via slidingWindowRateLimit
  // (not the fixed-window counter) so the daily budget can't be doubled across
  // a midnight boundary. The complementary 1/company/user cap is a durable DB
  // check in core's finalizeSubmission, not a Redis window.
  submitReport: { name: "submit-report", limit: 10, windowSeconds: 86_400 },
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

// Sliding-window rate limit, backed by a Redis sorted set (one member per
// action, scored by timestamp). On each call we drop members older than the
// window, add the current one, and count what's left. Unlike the fixed-window
// counter above, this has no boundary-reset exploit: a "10 per 24h" budget
// can't be bypassed by firing 10 at 23:59 and 10 more at 00:01, because the
// window slides continuously. Reserved for the surfaces where that precision
// matters (report submission); the cheap, generous budgets (autosave,
// suggestions) stay on the fixed-window counter.
//
// Same fail-open contract as rateLimit: a Redis hiccup allows the call.
export async function slidingWindowRateLimit(
  policy: RateLimitPolicy,
  principal: string,
): Promise<RateLimitResult> {
  const redis = getClient();
  if (!redis) return { ok: true, remaining: -1 };

  const key = `rlz:${policy.name}:${principal}`;
  const now = Date.now();
  const windowMs = policy.windowSeconds * 1000;
  const windowStart = now - windowMs;
  // Unique member: timestamp + entropy so two actions in the same millisecond
  // don't collapse to one sorted-set member.
  const member = `${now}-${Math.random().toString(36).slice(2)}`;

  try {
    const results = await redis
      .multi()
      .zremrangebyscore(key, 0, windowStart) // evict expired
      .zadd(key, now, member) // record this action
      .zcard(key) // count live actions (incl. this one)
      .pexpire(key, windowMs) // let the key self-expire when idle
      .exec();

    // exec() → [[err, res], ...] in command order; zcard is index 2.
    const count = Number(results?.[2]?.[1] ?? 0);
    return { ok: count <= policy.limit, remaining: Math.max(0, policy.limit - count) };
  } catch (err) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn(
        `slidingWindowRateLimit: Redis unavailable, failing open for ${policy.name}`,
        err,
      );
    }
    return { ok: true, remaining: -1 };
  }
}

// User-facing copy for an exhausted budget. Safe to surface to the client;
// shared so guarded actions return it in an ActionResult without restating it.
export const RATE_LIMIT_MESSAGE =
  "Rate limit exceeded. Please slow down and try again shortly.";
