import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/services/forecast/DateTimeService", () => ({
  dateTimeService: {
    endOfDay: vi.fn((d: Date) => ({ valueOf: () => d.getTime() })),
    toDate: vi.fn((d: unknown) => (d instanceof Date ? d : new Date(d as string))),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import {
  getDisplayChainBalanceAtDate,
  getProjectedBalanceAtDate,
} from "../getProjectedBalanceAtDate";

function createCache(accounts: unknown[], entries: unknown[]) {
  return {
    accountRegister: { findOne: vi.fn(() => accounts[0] ?? null) },
    registerEntry: { find: vi.fn(() => entries) },
  } as any;
}

const TARGET = new Date("2024-06-10T00:00:00.000Z");
const BEFORE = new Date("2024-06-01T00:00:00.000Z");
const AFTER = new Date("2024-06-20T00:00:00.000Z");

function entry(overrides: Record<string, unknown>) {
  return {
    amount: 100,
    createdAt: BEFORE,
    isBalanceEntry: false,
    isCleared: false,
    isManualEntry: false,
    isProjected: false,
    ...overrides,
  };
}

describe("getProjectedBalanceAtDate", () => {
  let cache: any;

  beforeEach(() => {
    cache = createCache(
      [{ id: 1, latestBalance: "500.00" }],
      [],
    );
  });

  it("returns 0 when the account register is missing", () => {
    cache = createCache([], []);

    expect(getProjectedBalanceAtDate(cache, 99, TARGET)).toBe(0);
  });

  it("adds only non-balance entries at or before the target date", () => {
    cache = createCache([{ id: 1, latestBalance: 500 }], [
      entry({ amount: 100, createdAt: BEFORE }),
      entry({ amount: 50, createdAt: TARGET }),
      entry({ amount: 999, createdAt: AFTER }),
      entry({ amount: -25, createdAt: BEFORE, isBalanceEntry: true }),
    ]);

    expect(getProjectedBalanceAtDate(cache, 1, TARGET)).toBe(650);
  });

  it("coerces string latestBalance and entry amounts", () => {
    cache = createCache([{ id: 1, latestBalance: "10.5" }], [
      entry({ amount: "2.25" }),
    ]);

    expect(getProjectedBalanceAtDate(cache, 1, TARGET)).toBe(12.75);
  });

  it("skips entries with invalid dates", () => {
    cache = createCache([{ id: 1, latestBalance: 100 }], [
      entry({ amount: 50, createdAt: "not-a-date" }),
      entry({ amount: 50, createdAt: BEFORE }),
    ]);

    expect(getProjectedBalanceAtDate(cache, 1, TARGET)).toBe(150);
  });
});

describe("getDisplayChainBalanceAtDate", () => {
  it("returns 0 when the account register is missing", () => {
    const cache = createCache([], []);

    expect(getDisplayChainBalanceAtDate(cache, 99, TARGET)).toBe(0);
  });

  it("anchors on the latest balance entry and accumulates manual/projected entries after it", () => {
    const cache = createCache([{ id: 1, latestBalance: 0 }], [
      entry({ amount: 1000, isBalanceEntry: true, createdAt: new Date("2024-05-01") }),
      entry({ amount: 200, isManualEntry: true, createdAt: BEFORE }),
      entry({ amount: 50, isProjected: true, createdAt: BEFORE }),
      entry({ amount: 999, createdAt: AFTER }), // future: excluded
    ]);

    expect(getDisplayChainBalanceAtDate(cache, 1, TARGET)).toBe(1250);
  });

  it("excludes pending Plaid activity (non-manual, non-projected, uncleared) and cleared entries", () => {
    const cache = createCache([{ id: 1, latestBalance: 0 }], [
      entry({ amount: 1000, isBalanceEntry: true, createdAt: new Date("2024-05-01") }),
      entry({ amount: 300, createdAt: BEFORE }), // real pending Plaid row
      entry({ amount: 400, isCleared: true, isManualEntry: true, createdAt: BEFORE }),
    ]);

    expect(getDisplayChainBalanceAtDate(cache, 1, TARGET)).toBe(1000);
  });

  it("uses the latest balance entry when several exist", () => {
    const cache = createCache([{ id: 1, latestBalance: 0 }], [
      entry({ amount: 1000, isBalanceEntry: true, createdAt: new Date("2024-05-01") }),
      entry({ amount: 2000, isBalanceEntry: true, createdAt: new Date("2024-06-05") }),
      entry({ amount: 100, isManualEntry: true, createdAt: BEFORE }),
    ]);

    expect(getDisplayChainBalanceAtDate(cache, 1, TARGET)).toBe(2100);
  });

  it("falls back to latestBalance when no balance entry is in range", () => {
    const cache = createCache([{ id: 1, latestBalance: 750 }], [
      entry({ amount: 1000, isBalanceEntry: true, createdAt: AFTER }),
      entry({ amount: 25, isManualEntry: true, createdAt: BEFORE }),
    ]);

    expect(getDisplayChainBalanceAtDate(cache, 1, TARGET)).toBe(775);
  });

  it("ignores entries past the target date entirely", () => {
    const cache = createCache([{ id: 1, latestBalance: 500 }], [
      entry({ amount: 1000, isBalanceEntry: true, createdAt: AFTER }),
      entry({ amount: 100, isManualEntry: true, createdAt: AFTER }),
    ]);

    expect(getDisplayChainBalanceAtDate(cache, 1, TARGET)).toBe(500);
  });
});
