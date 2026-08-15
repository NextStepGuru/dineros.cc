import { afterEach, describe, expect, it } from "vitest";
import { dateTimeService } from "~/server/services/forecast";
import { pickLowestBalanceInHorizon } from "../registerLedgerFuture";

type Entry = { id: number; balance: number; createdAt: Date };

function entry(
  id: number,
  balance: number,
  createdAt: string,
): Entry {
  return { id, balance, createdAt: new Date(createdAt) };
}

describe("pickLowestBalanceInHorizon", () => {
  afterEach(() => {
    dateTimeService.clearNowOverride();
  });

  it("prefers the earliest sub-zero balance over a deeper negative later", () => {
    dateTimeService.setNowOverride(new Date("2024-01-15T12:00:00.000Z"));
    const entries = [
      entry(1, 100, "2024-01-20T00:00:00.000Z"),
      entry(2, -10, "2024-01-25T00:00:00.000Z"),
      entry(3, -500, "2024-02-05T00:00:00.000Z"),
      entry(4, 50, "2024-02-10T00:00:00.000Z"),
    ];

    const picked = pickLowestBalanceInHorizon(entries, 30);
    expect(picked?.id).toBe(2);
  });

  it("falls back to absolute minimum in window when no sub-zero exists", () => {
    dateTimeService.setNowOverride(new Date("2024-01-15T12:00:00.000Z"));
    const entries = [
      entry(1, 200, "2024-01-20T00:00:00.000Z"),
      entry(2, 40, "2024-01-25T00:00:00.000Z"),
      entry(3, 75, "2024-02-01T00:00:00.000Z"),
      entry(4, 40, "2024-02-10T00:00:00.000Z"),
    ];

    const picked = pickLowestBalanceInHorizon(entries, 30);
    expect(picked?.id).toBe(2);
  });

  it("ignores entries after the window", () => {
    dateTimeService.setNowOverride(new Date("2024-01-15T12:00:00.000Z"));
    const entries = [
      entry(1, 100, "2024-01-20T00:00:00.000Z"),
      entry(2, 20, "2024-01-25T00:00:00.000Z"),
      entry(3, -999, "2024-03-01T00:00:00.000Z"),
    ];

    const picked = pickLowestBalanceInHorizon(entries, 30);
    expect(picked?.id).toBe(2);
  });

  it("returns undefined for an empty window", () => {
    dateTimeService.setNowOverride(new Date("2024-01-15T12:00:00.000Z"));
    const entries = [
      entry(1, -50, "2023-12-01T00:00:00.000Z"),
      entry(2, -10, "2024-03-01T00:00:00.000Z"),
    ];

    expect(pickLowestBalanceInHorizon(entries, 30)).toBeUndefined();
  });
});
