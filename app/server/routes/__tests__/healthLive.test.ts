import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  createError: vi.fn((error: any) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const err = new Error(`HTTP ${statusCode}: ${message}`) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    err.data = error.data;
    throw err;
  }),
}));

const healthState = vi.hoisted(() => ({
  getState: vi.fn(),
  isLive: vi.fn(),
}));
vi.mock("~/server/services/poolTimeoutHealthService", () => ({
  poolTimeoutHealthService: healthState,
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import liveness from "../health/live.get";

describe("GET /api/health/live (route handler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports ok with the pool timeout state when the service is live", () => {
    healthState.isLive.mockReturnValue(true);
    healthState.getState.mockReturnValue({
      recentPoolTimeoutCount: 1,
      threshold: 5,
      windowMs: 60_000,
    });

    expect(liveness({} as any)).toEqual({
      ok: true,
      recentPoolTimeoutCount: 1,
      threshold: 5,
      windowMs: 60_000,
    });
  });

  it("throws a 500 unhealthy error when too many pool timeouts occurred", () => {
    healthState.isLive.mockReturnValue(false);
    healthState.getState.mockReturnValue({
      recentPoolTimeoutCount: 6,
      threshold: 5,
      windowMs: 60_000,
    });

    expect(() => liveness({} as any)).toThrow(/Unhealthy/);
    try {
      liveness({} as any);
    } catch (err: any) {
      expect(err.statusCode).toBe(500);
      expect(err.statusMessage).toBe("Unhealthy");
    }
  });
});
