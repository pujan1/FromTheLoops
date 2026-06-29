import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We drive ioredis through a hoisted stub so each test can dictate what the
// commands return (or throw). The chainable `multi()` mirrors the real builder
// so slidingWindowRateLimit reads zcard off index 2 of exec()'s result.
const state = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  exec: vi.fn(),
}));

vi.mock("ioredis", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["zremrangebyscore", "zadd", "zcard", "pexpire"]) chain[m] = () => chain;
  chain.exec = () => state.exec();
  class MockRedis {
    on() {}
    incr = (...a: unknown[]) => state.incr(...a);
    expire = (...a: unknown[]) => state.expire(...a);
    multi = () => chain;
  }
  return { default: MockRedis };
});

// rate-limit.ts memoizes its client + a "warned once" flag at module scope, so
// every test gets a fresh module via resetModules + dynamic import.
async function load() {
  vi.resetModules();
  return import("./rate-limit");
}

const ORIGINAL_URL = process.env.REDIS_URL;
afterEach(() => {
  process.env.REDIS_URL = ORIGINAL_URL;
  vi.clearAllMocks();
});

describe("policy constants", () => {
  it("keep their tuned budgets", async () => {
    const { RATE_LIMITS } = await load();
    expect(RATE_LIMITS.submitReport).toEqual({
      name: "submit-report",
      limit: 10,
      windowSeconds: 86_400,
    });
    expect(RATE_LIMITS.suggestCompany.limit).toBe(10);
  });
});

describe("fail-open when Redis is absent", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  it("rateLimit allows the call with no client configured", async () => {
    const { rateLimit, RATE_LIMITS } = await load();
    expect(await rateLimit(RATE_LIMITS.saveDraft, "u1")).toEqual({
      ok: true,
      remaining: -1,
    });
    expect(state.incr).not.toHaveBeenCalled();
  });

  it("slidingWindowRateLimit allows the call with no client configured", async () => {
    const { slidingWindowRateLimit, RATE_LIMITS } = await load();
    expect(await slidingWindowRateLimit(RATE_LIMITS.submitReport, "u1")).toEqual({
      ok: true,
      remaining: -1,
    });
  });
});

describe("fail-open when Redis errors", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("rateLimit allows the call and warns when incr throws", async () => {
    state.incr.mockRejectedValue(new Error("ECONNREFUSED"));
    const { rateLimit, RATE_LIMITS } = await load();
    expect(await rateLimit(RATE_LIMITS.saveDraft, "u1")).toEqual({
      ok: true,
      remaining: -1,
    });
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("slidingWindowRateLimit fails open when the pipeline throws", async () => {
    state.exec.mockRejectedValue(new Error("ECONNREFUSED"));
    const { slidingWindowRateLimit, RATE_LIMITS } = await load();
    expect(await slidingWindowRateLimit(RATE_LIMITS.submitReport, "u1")).toEqual({
      ok: true,
      remaining: -1,
    });
  });
});

describe("rateLimit counting (Redis up)", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it("sets the TTL only on the first hit of a window", async () => {
    state.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const { rateLimit, RATE_LIMITS } = await load();
    const first = await rateLimit(RATE_LIMITS.suggestCompany, "u1");
    const second = await rateLimit(RATE_LIMITS.suggestCompany, "u1");
    expect(first).toEqual({ ok: true, remaining: 9 });
    expect(second).toEqual({ ok: true, remaining: 8 });
    expect(state.expire).toHaveBeenCalledTimes(1);
  });

  it("rejects once the count exceeds the limit", async () => {
    state.incr.mockResolvedValue(11); // suggestCompany limit is 10
    const { rateLimit, RATE_LIMITS } = await load();
    expect(await rateLimit(RATE_LIMITS.suggestCompany, "u1")).toEqual({
      ok: false,
      remaining: 0,
    });
  });
});

describe("slidingWindowRateLimit counting (Redis up)", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it("reads the live count from the zcard slot and rejects over budget", async () => {
    // exec() → [[err,res], ...]; zcard is index 2. 11 live actions > limit 10.
    state.exec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 11],
      [null, 1],
    ]);
    const { slidingWindowRateLimit, RATE_LIMITS } = await load();
    expect(await slidingWindowRateLimit(RATE_LIMITS.submitReport, "u1")).toEqual({
      ok: false,
      remaining: 0,
    });
  });
});
