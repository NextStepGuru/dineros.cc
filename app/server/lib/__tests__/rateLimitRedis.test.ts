import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
}));
vi.mock("~/server/clients/redisClient", () => ({
  sharedRedisConnection: redis,
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import { clientIpFromEvent, rateLimitByKey } from "../rateLimitRedis";

describe("rateLimitByKey", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("allows everything in the test environment without touching redis", async () => {
    const result = await rateLimitByKey({
      key: "login:1.2.3.4",
      limit: 1,
      windowSeconds: 60,
    });

    expect(result).toEqual({ allowed: true });
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("counts requests, sets expiry on the first hit, and allows up to the limit", async () => {
    process.env.NODE_ENV = "production";
    redis.incr.mockResolvedValue(1);

    const first = await rateLimitByKey({
      key: "login:1.2.3.4",
      limit: 2,
      windowSeconds: 60,
    });
    expect(first).toEqual({ allowed: true });
    expect(redis.expire).toHaveBeenCalledWith("login:1.2.3.4", 60);

    redis.incr.mockResolvedValue(2);
    const second = await rateLimitByKey({
      key: "login:1.2.3.4",
      limit: 2,
      windowSeconds: 60,
    });
    expect(second).toEqual({ allowed: true });
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it("blocks requests past the limit with the redis ttl as retry-after", async () => {
    process.env.NODE_ENV = "production";
    redis.incr.mockResolvedValue(3);
    redis.ttl.mockResolvedValue(42);

    const result = await rateLimitByKey({
      key: "login:1.2.3.4",
      limit: 2,
      windowSeconds: 60,
    });

    expect(result).toEqual({ allowed: false, retryAfterSec: 42 });
  });

  it("falls back to the window seconds when the ttl is not positive", async () => {
    process.env.NODE_ENV = "production";
    redis.incr.mockResolvedValue(9);
    redis.ttl.mockResolvedValue(-1);

    const result = await rateLimitByKey({
      key: "login:1.2.3.4",
      limit: 2,
      windowSeconds: 60,
    });

    expect(result).toEqual({ allowed: false, retryAfterSec: 60 });
  });
});

describe("clientIpFromEvent", () => {
  it("takes the first entry of a comma-separated x-forwarded-for header", () => {
    const ip = clientIpFromEvent({
      node: {
        req: {
          headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
          socket: { remoteAddress: "3.3.3.3" },
        },
      },
    });
    expect(ip).toBe("1.1.1.1");
  });

  it("supports array-valued headers", () => {
    const ip = clientIpFromEvent({
      node: {
        req: {
          headers: { "x-forwarded-for": ["5.5.5.5, 6.6.6.6"] },
          socket: { remoteAddress: "3.3.3.3" },
        },
      },
    });
    expect(ip).toBe("5.5.5.5");
  });

  it("falls back to the socket remote address", () => {
    const ip = clientIpFromEvent({
      node: { req: { headers: {}, socket: { remoteAddress: "7.7.7.7" } } },
    });
    expect(ip).toBe("7.7.7.7");
  });

  it("returns unknown when nothing is available", () => {
    expect(clientIpFromEvent({})).toBe("unknown");
    expect(clientIpFromEvent({ node: { req: { headers: {} } } })).toBe(
      "unknown",
    );
  });
});
