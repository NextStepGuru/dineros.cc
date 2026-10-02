import { beforeEach, describe, expect, it, vi } from "vitest";

let nowMs = 1_000_000;

vi.mock("~/server/services/forecast/DateTimeService", () => ({
  dateTimeService: {
    now: vi.fn(() => ({
      toDate: () => new Date(nowMs),
    })),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import { poolTimeoutHealthService } from "../poolTimeoutHealthService";

const POOL_TIMEOUT_ERROR =
  "Pool timeout: failed to retrieve a connection from pool";

describe("poolTimeoutHealthService", () => {
  beforeEach(() => {
    // Park the clock far in the future so the 60s window prunes earlier tests' records.
    nowMs += 10 * 60_000;
  });

  it("ignores errors that are not pool timeouts", () => {
    poolTimeoutHealthService.record(new Error("connection refused"));
    poolTimeoutHealthService.record("some other failure");

    expect(poolTimeoutHealthService.isLive()).toBe(true);
    expect(poolTimeoutHealthService.getState()).toMatchObject({
      recentPoolTimeoutCount: 0,
    });
  });

  it("matches pool timeout errors case-insensitively", () => {
    poolTimeoutHealthService.record(POOL_TIMEOUT_ERROR.toUpperCase());

    expect(poolTimeoutHealthService.getState().recentPoolTimeoutCount).toBe(1);
  });

  it("stays live below the threshold and goes unhealthy at it", () => {
    for (let i = 0; i < 4; i += 1) {
      poolTimeoutHealthService.record(new Error(POOL_TIMEOUT_ERROR));
    }
    expect(poolTimeoutHealthService.isLive()).toBe(true);

    poolTimeoutHealthService.record(new Error(POOL_TIMEOUT_ERROR));
    expect(poolTimeoutHealthService.isLive()).toBe(false);
    expect(poolTimeoutHealthService.getState()).toEqual({
      recentPoolTimeoutCount: 5,
      threshold: 5,
      windowMs: 60_000,
    });
  });

  it("recovers once the recorded timeouts age out of the 60s window", () => {
    for (let i = 0; i < 5; i += 1) {
      poolTimeoutHealthService.record(new Error(POOL_TIMEOUT_ERROR));
      nowMs += 5_000;
    }
    expect(poolTimeoutHealthService.isLive()).toBe(false);

    // Jump past the window: all records prune out.
    nowMs += 120_000;
    expect(poolTimeoutHealthService.isLive()).toBe(true);
    expect(poolTimeoutHealthService.getState().recentPoolTimeoutCount).toBe(0);
  });

  it("keeps counting failures newer than the window only", () => {
    for (let i = 0; i < 3; i += 1) {
      poolTimeoutHealthService.record(new Error(POOL_TIMEOUT_ERROR));
    }
    nowMs += 90_000; // first three age out
    poolTimeoutHealthService.record(new Error(POOL_TIMEOUT_ERROR));

    expect(poolTimeoutHealthService.getState().recentPoolTimeoutCount).toBe(1);
    expect(poolTimeoutHealthService.isLive()).toBe(true);
  });
});
