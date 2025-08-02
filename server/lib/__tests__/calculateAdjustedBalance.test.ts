import { describe, it, expect } from "vitest";
import { calculateAdjustedBalance } from "../calculateAdjustedBalance";

describe("calculateAdjustedBalance", () => {
  it("should handle empty pocket balances array", () => {
    const mainBalance = 1000;
    const pocketBalances: Array<{ balance: any }> = [];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000);
  });

  it("should handle null/undefined main balance", () => {
    const pocketBalances = [{ balance: 100 }];

    const result = calculateAdjustedBalance(null, pocketBalances);

    expect(result).toBe(-100); // null becomes 0, then subtract pocket balance
  });

  it("should throw error for invalid main balance", () => {
    const pocketBalances = [{ balance: 100 }];

    expect(() => calculateAdjustedBalance("invalid", pocketBalances)).toThrow(
      "Invalid mainBalance: invalid. Expected a valid number."
    );
  });

  it("should handle positive pocket balances", () => {
    const mainBalance = 1000;
    const pocketBalances = [
      { balance: 100 },
      { balance: 200 },
      { balance: 50 },
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000 - (100 + 200 + 50)); // 650
  });

  it("should handle negative pocket balances by setting them to 0", () => {
    const mainBalance = 1000;
    const pocketBalances = [
      { balance: 100 },
      { balance: -200 }, // Should become 0
      { balance: 50 },
      { balance: -150 }, // Should become 0
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000 - (100 + 0 + 50 + 0)); // 850
  });

  it("should handle mixed positive and negative pocket balances", () => {
    const mainBalance = 500;
    const pocketBalances = [
      { balance: 75 },
      { balance: -25 }, // Should become 0
      { balance: 100 },
      { balance: -50 }, // Should become 0
      { balance: 25 },
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(500 - (75 + 0 + 100 + 0 + 25)); // 300
  });

  it("should handle all negative pocket balances", () => {
    const mainBalance = 1000;
    const pocketBalances = [
      { balance: -100 },
      { balance: -200 },
      { balance: -50 },
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000 - (0 + 0 + 0)); // 1000
  });

  it("should handle Prisma Decimal types", () => {
    // Mock Prisma Decimal objects that have a toString method
    const mainBalance = { toString: () => "1000" };
    const pocketBalances = [
      { balance: { toString: () => "100" } },
      { balance: { toString: () => "-200" } },
      { balance: { toString: () => "50" } },
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000 - (100 + 0 + 50)); // 850
  });

  it("should handle string numbers", () => {
    const mainBalance = "1000";
    const pocketBalances = [
      { balance: "100" },
      { balance: "-200" },
      { balance: "50" },
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000 - (100 + 0 + 50)); // 850
  });

  it("should handle null/undefined pocket balances", () => {
    const mainBalance = 1000;
    const pocketBalances = [
      { balance: 100 },
      { balance: null },
      { balance: undefined },
      { balance: 50 },
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000 - (100 + 0 + 0 + 50)); // 850
  });

  it("should handle zero main balance", () => {
    const mainBalance = 0;
    const pocketBalances = [{ balance: 100 }, { balance: 200 }];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(0 - (100 + 200)); // -300
  });

  it("should handle negative main balance", () => {
    const mainBalance = -500;
    const pocketBalances = [{ balance: 100 }, { balance: 200 }];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(-500 - (100 + 200)); // -800
  });

  it("should handle large numbers", () => {
    const mainBalance = 1000000;
    const pocketBalances = [
      { balance: 250000 },
      { balance: -50000 }, // Should become 0
      { balance: 100000 },
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000000 - (250000 + 0 + 100000)); // 650000
  });

  it("should handle decimal values", () => {
    const mainBalance = 1000.5;
    const pocketBalances = [
      { balance: 100.25 },
      { balance: -200.75 }, // Should become 0
      { balance: 50.1 },
    ];

    const result = calculateAdjustedBalance(mainBalance, pocketBalances);

    expect(result).toBe(1000.5 - (100.25 + 0 + 50.1)); // 850.15
  });

  it("should throw error for invalid pocket balances array", () => {
    const mainBalance = 1000;

    expect(() =>
      calculateAdjustedBalance(mainBalance, "not an array" as any)
    ).toThrow("Invalid pocketBalances: not an array. Expected an array.");
  });

  it("should throw error for invalid pocket balance object", () => {
    const mainBalance = 1000;
    const pocketBalances = [
      { balance: 100 },
      "invalid object",
      { balance: 50 },
    ] as any;

    expect(() => calculateAdjustedBalance(mainBalance, pocketBalances)).toThrow(
      "Invalid pocket balance at index 1: invalid object. Expected object with 'balance' property."
    );
  });

  it("should throw error for invalid balance value", () => {
    const mainBalance = 1000;
    const pocketBalances = [
      { balance: 100 },
      { balance: "invalid" },
      { balance: 50 },
    ] as any;

    expect(() => calculateAdjustedBalance(mainBalance, pocketBalances)).toThrow(
      "Invalid balance at index 1: invalid. Expected a valid number."
    );
  });
});
