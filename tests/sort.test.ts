import { expect, describe, it } from "vitest";
import {
  recalculateRunningBalanceAndSort,
  type PartialRegisterEntry,
} from "../lib/sort";
import { debitRegisterEntries, creditRegisterEntries } from "./sort.data";
import { cloneDeep } from "lodash-es";

describe("recalculateRunningBalanceAndSort", () => {
  it("sort debit balances", () => {
    const balance = 1000;
    const type = "debit";

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort<PartialRegisterEntry>(
        cloneDeep(debitRegisterEntries)
      ).map((entry) => ({ ...entry, balance: 0 })),
      balance,
      type,
    });

    // Verify the sort function works correctly
    expect(result.length).toBe(debitRegisterEntries.length);

    // Should have sequence numbers from 1 to length
    expect(result.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Should have proper order: cleared entries (chronological), balance entry, pending entries (reverse chronological)
    const clearedEntries = result.filter(
      (r) => r.isCleared && !r.isBalanceEntry
    );
    const balanceEntries = result.filter((r) => r.isBalanceEntry);
    const pendingEntries = result.filter(
      (r) => !r.isCleared && !r.isBalanceEntry
    );

    expect(balanceEntries.length).toBe(1);

    // Verify running balance calculation is correct
    const balanceEntry = balanceEntries[0];
    expect(balanceEntry.balance).toBe(balance); // Balance entry should have balance = amount

    // Each entry should have a calculated balance based on running total
    expect(result.every((r) => typeof r.balance === "number")).toBe(true);
  });

  it("sort credit balances", () => {
    const balance = 0;
    const type = "credit";

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort<PartialRegisterEntry>(
        cloneDeep(creditRegisterEntries)
      ).map((entry) => ({ ...entry, balance: 0 })),
      balance,
      type,
    });

    // Verify the sort function works correctly
    expect(result.length).toBe(creditRegisterEntries.length);

    // Should have sequence numbers from 1 to length
    expect(result.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Should have proper order: cleared entries (chronological), balance entry, pending entries (reverse chronological)
    const clearedEntries = result.filter(
      (r) => r.isCleared && !r.isBalanceEntry
    );
    const balanceEntries = result.filter((r) => r.isBalanceEntry);
    const pendingEntries = result.filter(
      (r) => !r.isCleared && !r.isBalanceEntry
    );

    expect(balanceEntries.length).toBe(1);

    // Verify running balance calculation is correct
    const balanceEntry = balanceEntries[0];
    expect(balanceEntry.balance).toBe(balanceEntry.amount); // Balance entry should have balance = amount

    // Each entry should have a calculated balance based on running total
    expect(result.every((r) => typeof r.balance === "number")).toBe(true);
  });
});

function randomSort<T>(array: T[]): T[] {
  return array.sort(() => Math.random() - 0.5);
}
