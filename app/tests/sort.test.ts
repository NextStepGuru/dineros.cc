import assert from "node:assert";
import { expect, describe, it } from "vitest";
import {
  recalculateRunningBalanceAndSort,
  type PartialRegisterEntry,
} from "../lib/sort";
import { debitRegisterEntries, creditRegisterEntries } from "./sort.data";
import { cloneDeep } from "lodash-es";
import { dateTimeService } from "~/server/services/forecast";

describe("recalculateRunningBalanceAndSort", () => {
  it("sort debit balances", () => {
    const balance = 1000;
    const type = "debit";

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort<PartialRegisterEntry>(
        cloneDeep(debitRegisterEntries),
      ).map((entry) => ({ ...entry, balance: 0 })),
      balance,
      type,
    });

    // Verify the sort function works correctly
    expect(result.length).toBe(debitRegisterEntries.length);

    // Should have sequence numbers from 1 to length
    expect(result.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const balanceEntries = result.filter((r) => r.isBalanceEntry);

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
        cloneDeep(creditRegisterEntries),
      ).map((entry) => ({ ...entry, balance: 0 })),
      balance,
      type,
    });

    // Verify the sort function works correctly
    expect(result.length).toBe(creditRegisterEntries.length);

    // Should have sequence numbers from 1 to length
    expect(result.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const balanceEntries = result.filter((r) => r.isBalanceEntry);

    expect(balanceEntries.length).toBe(1);

    // Verify running balance calculation is correct
    const balanceEntry = balanceEntries[0];
    expect(balanceEntry.balance).toBe(balanceEntry.amount); // Balance entry should have balance = amount

    // Each entry should have a calculated balance based on running total
    expect(result.every((r) => typeof r.balance === "number")).toBe(true);
  });

  it("should handle pending entries before balance (isProjected=0, isPending=1)", () => {
    const balance = 1000;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
      // Cleared entry
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-01"),
        isBalanceEntry: false,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Balance entry
      {
        amount: 1000,
        balance: 1000,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Pending entries that should go BEFORE balance (isProjected=0, isPending=1)
      {
        amount: -50,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
      {
        amount: -25,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-17"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
      // Regular pending entries that go AFTER balance
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-18"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Projected entry that goes AFTER balance
      {
        amount: -200,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-19"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: true,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(testEntries)),
      balance,
      type,
    });

    // Find the balance entry position
    const balanceEntryIndex = result.findIndex((r) => r.isBalanceEntry);
    expect(balanceEntryIndex).toBeGreaterThan(0); // Should not be first

    // Verify order: cleared entries, pending entries before balance, balance entry, other pending entries
    const clearedEntries = result
      .slice(0, balanceEntryIndex)
      .filter((r) => r.isCleared && !r.isBalanceEntry);
    const pendingBeforeBalance = result
      .slice(0, balanceEntryIndex)
      .filter((r) => !r.isCleared && !r.isBalanceEntry);
    const balanceEntry = result[balanceEntryIndex];
    const pendingAfterBalance = result.slice(balanceEntryIndex + 1);

    // Verify cleared entries come first
    expect(clearedEntries.length).toBe(1);
    expect(clearedEntries[0].amount).toBe(-100);

    // Verify pending entries before balance are isProjected=0 and isPending=1
    expect(pendingBeforeBalance.length).toBe(2);
    expect(
      pendingBeforeBalance.every((r) => !r.isProjected && r.isPending),
    ).toBe(true);

    // Verify chronological order of pending entries before balance (older first)
    expect(pendingBeforeBalance[0].amount).toBe(-50); // Jan 16 (older)
    expect(pendingBeforeBalance[1].amount).toBe(-25); // Jan 17 (newer)

    // Verify balance entry
    expect(balanceEntry.isBalanceEntry).toBe(true);
    expect(balanceEntry.balance).toBe(balance);

    // Verify pending entries after balance
    expect(pendingAfterBalance.length).toBe(2);
    expect(pendingAfterBalance.some((r) => r.isProjected)).toBe(true); // Contains projected entry

    // Verify running balance calculations for pending entries before balance
    // These work backwards: start from balance, process in reverse order
    // Reverse order: Jan 17 (-25), then Jan 16 (-50)
    // 1000 - (-25) = 1025, then 1025 - (-50) = 1075
    expect(pendingBeforeBalance[0].balance).toBe(1075); // Jan 16: 1075
    expect(pendingBeforeBalance[1].balance).toBe(1025); // Jan 17: 1025

    // Verify running balance calculations for pending entries after balance
    // These should work forwards from the balance
    expect(pendingAfterBalance[0].balance).toBe(balance - 100); // 900 (first after balance)
    expect(pendingAfterBalance[1].balance).toBe(balance - 100 - 200); // 700 (second after balance)
  });

  it("should handle mixed pending types correctly", () => {
    const balance = 500;
    const type = "credit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 500,
        balance: 500,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Multiple pending entries before balance (isProjected=0, isPending=1)
      {
        amount: 50,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
      {
        amount: 25,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-17"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
      {
        amount: 100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-18"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
      // Pending entries that go after balance (not pending=1 and projected=0)
      {
        amount: 75,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-19"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: true,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(testEntries)),
      balance,
      type,
    });

    const balanceEntryIndex = result.findIndex((r) => r.isBalanceEntry);
    const pendingBeforeBalance = result
      .slice(0, balanceEntryIndex)
      .filter((r) => !r.isBalanceEntry);
    const balanceEntry = result[balanceEntryIndex];
    const pendingAfterBalance = result.slice(balanceEntryIndex + 1);

    // Should have 3 pending entries before balance
    expect(pendingBeforeBalance.length).toBe(3);
    expect(
      pendingBeforeBalance.every((r) => !r.isProjected && r.isPending),
    ).toBe(true);

    // Verify chronological order (older first)
    expect(pendingBeforeBalance[0].amount).toBe(50); // Jan 16 (oldest)
    expect(pendingBeforeBalance[1].amount).toBe(25); // Jan 17
    expect(pendingBeforeBalance[2].amount).toBe(100); // Jan 18 (newest)

    // Verify running balances work backwards from balance
    // Reverse calculation order: Jan 18 (100), Jan 17 (25), Jan 16 (50)
    // 500 - 100 = 400, then 400 - 25 = 375, then 375 - 50 = 325
    expect(pendingBeforeBalance[0].balance).toBe(325); // Jan 16: 325 (last calculated)
    expect(pendingBeforeBalance[1].balance).toBe(375); // Jan 17: 375
    expect(pendingBeforeBalance[2].balance).toBe(400); // Jan 18: 400 (first calculated)

    // Balance entry should show original balance
    expect(balanceEntry.balance).toBe(balance);

    // Should have 1 pending entry after balance
    expect(pendingAfterBalance.length).toBe(1);
    expect(pendingAfterBalance[0].isProjected).toBe(true);
    expect(pendingAfterBalance[0].balance).toBe(balance + 75); // 575
  });

  it("should handle edge case with no pending entries before balance", () => {
    const balance = 1000;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 1000,
        balance: 1000,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Only pending entries that go after balance
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-18"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(testEntries)),
      balance,
      type,
    });

    const balanceEntryIndex = result.findIndex((r) => r.isBalanceEntry);
    expect(balanceEntryIndex).toBe(0); // Balance should be first when no pending entries before it

    const balanceEntry = result[balanceEntryIndex];
    const pendingAfterBalance = result.slice(balanceEntryIndex + 1);

    expect(balanceEntry.balance).toBe(balance);
    expect(pendingAfterBalance.length).toBe(1);
    expect(pendingAfterBalance[0].balance).toBe(balance - 100);
  });

  it("should handle edge case with only pending entries before balance", () => {
    const balance = 800;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 800,
        balance: 800,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Only pending entries before balance (isProjected=0, isPending=1)
      {
        amount: -50,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
      {
        amount: -30,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-17"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(testEntries)),
      balance,
      type,
    });

    const balanceEntryIndex = result.findIndex((r) => r.isBalanceEntry);
    const pendingBeforeBalance = result.slice(0, balanceEntryIndex);
    const balanceEntry = result[balanceEntryIndex];

    expect(pendingBeforeBalance.length).toBe(2);
    expect(balanceEntry.balance).toBe(balance);
    expect(result.length).toBe(3); // No entries after balance

    // Verify running balances
    // Reverse calculation order: Jan 17 (-30), then Jan 16 (-50)
    // 800 - (-30) = 830, then 830 - (-50) = 880
    expect(pendingBeforeBalance[0].balance).toBe(880); // Jan 16: 880
    expect(pendingBeforeBalance[1].balance).toBe(830); // Jan 17: 830
  });

  it("should handle manual entries with isMatched=true before balance entry", () => {
    const balance = 1000;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 1000,
        balance: 1000,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Manual entry with isMatched=true (should go before balance)
      {
        amount: -50,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: true,
        isPending: false,
        isProjected: false,
      },
      // Manual entry with isMatched=false (should go after balance)
      {
        amount: -75,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-17"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Regular pending entry (should go after balance)
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-18"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(testEntries)),
      balance,
      type,
    });

    const balanceEntryIndex = result.findIndex((r) => r.isBalanceEntry);
    const entriesBeforeBalance = result.slice(0, balanceEntryIndex);
    const balanceEntry = result[balanceEntryIndex];
    const entriesAfterBalance = result.slice(balanceEntryIndex + 1);

    // Should have one manual entry before balance (isMatched=true)
    expect(entriesBeforeBalance.length).toBe(1);
    expect(entriesBeforeBalance[0].isManualEntry).toBe(true);
    expect(entriesBeforeBalance[0].isMatched).toBe(true);
    expect(entriesBeforeBalance[0].amount).toBe(-50);

    // Balance entry should be present
    expect(balanceEntry.isBalanceEntry).toBe(true);
    expect(balanceEntry.balance).toBe(balance);

    // Should have two entries after balance (manual isMatched=false + regular)
    expect(entriesAfterBalance.length).toBe(2);

    // Find the manual entry with isMatched=false
    const manualEntryAfterBalance = entriesAfterBalance.find(
      (r) => r.isManualEntry,
    );
    assert(manualEntryAfterBalance);
    expect(manualEntryAfterBalance.isMatched).toBe(false);
    expect(manualEntryAfterBalance.amount).toBe(-75);

    // Regular entry should also be after balance
    const regularEntry = entriesAfterBalance.find((r) => !r.isManualEntry);
    assert(regularEntry);
    expect(regularEntry.amount).toBe(-100);

    // Verify running balance calculations
    // Entry before balance: 1000 - (-50) = 1050
    expect(entriesBeforeBalance[0].balance).toBe(1050);

    // Entries after balance should increment from balance
    expect(entriesAfterBalance[0].balance).toBe(balance - 75); // 925 (manual entry)
    expect(entriesAfterBalance[1].balance).toBe(balance - 75 - 100); // 825 (regular entry)
  });

  it("should handle multiple manual entries with mixed isMatched values", () => {
    const balance = 500;
    const type = "credit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 500,
        balance: 500,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Manual entry with isMatched=true (before balance)
      {
        amount: 25,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: true,
        isPending: false,
        isProjected: false,
      },
      // Another manual entry with isMatched=true (before balance)
      {
        amount: 50,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-17"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: true,
        isPending: false,
        isProjected: false,
      },
      // Manual entry with isMatched=false (after balance)
      {
        amount: 75,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-18"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Another manual entry with isMatched=false (after balance)
      {
        amount: 100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-19"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(testEntries)),
      balance,
      type,
    });

    const balanceEntryIndex = result.findIndex((r) => r.isBalanceEntry);
    const entriesBeforeBalance = result.slice(0, balanceEntryIndex);
    const balanceEntry = result[balanceEntryIndex];
    const entriesAfterBalance = result.slice(balanceEntryIndex + 1);

    // Should have 2 manual entries before balance (both isMatched=true)
    expect(entriesBeforeBalance.length).toBe(2);
    expect(
      entriesBeforeBalance.every((r) => r.isManualEntry && r.isMatched),
    ).toBe(true);

    // Verify chronological order for entries before balance (older first)
    expect(entriesBeforeBalance[0].amount).toBe(25); // Jan 16 (older)
    expect(entriesBeforeBalance[1].amount).toBe(50); // Jan 17 (newer)

    // Balance entry should be present
    expect(balanceEntry.isBalanceEntry).toBe(true);
    expect(balanceEntry.balance).toBe(balance);

    // Should have 2 manual entries after balance (both isMatched=false)
    expect(entriesAfterBalance.length).toBe(2);
    expect(
      entriesAfterBalance.every((r) => r.isManualEntry && !r.isMatched),
    ).toBe(true);

    // Verify chronological order for entries after balance (older first)
    expect(entriesAfterBalance[0].amount).toBe(75); // Jan 18 (older)
    expect(entriesAfterBalance[1].amount).toBe(100); // Jan 19 (newer)

    // Verify running balance calculations for entries before balance
    // Working backwards: 500 - 50 = 450, then 450 - 25 = 425
    expect(entriesBeforeBalance[0].balance).toBe(425); // Jan 16: 425
    expect(entriesBeforeBalance[1].balance).toBe(450); // Jan 17: 450

    // Verify running balance calculations for entries after balance
    expect(entriesAfterBalance[0].balance).toBe(balance + 75); // 575
    expect(entriesAfterBalance[1].balance).toBe(balance + 75 + 100); // 675
  });

  it("should handle manual entries combined with pending entries", () => {
    const balance = 800;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 800,
        balance: 800,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Pending entry that goes before balance (isProjected=0, isPending=1)
      {
        amount: -30,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
      // Manual entry with isMatched=true (before balance)
      {
        amount: -40,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-17"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: true,
        isPending: false,
        isProjected: false,
      },
      // Manual entry with isMatched=false (after balance)
      {
        amount: -50,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-18"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Regular projected entry (after balance)
      {
        amount: -60,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-19"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: true,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(testEntries)),
      balance,
      type,
    });

    const balanceEntryIndex = result.findIndex((r) => r.isBalanceEntry);
    const entriesBeforeBalance = result.slice(0, balanceEntryIndex);
    const balanceEntry = result[balanceEntryIndex];
    const entriesAfterBalance = result.slice(balanceEntryIndex + 1);

    // Should have 2 entries before balance: pending entry + manual entry (isMatched=true)
    expect(entriesBeforeBalance.length).toBe(2);

    // Find pending and manual entries before balance
    const pendingBeforeBalance = entriesBeforeBalance.find(
      (r) => !r.isProjected && r.isPending,
    );
    const manualBeforeBalance = entriesBeforeBalance.find(
      (r) => r.isManualEntry && r.isMatched,
    );

    assert(pendingBeforeBalance);
    expect(pendingBeforeBalance.amount).toBe(-30);

    assert(manualBeforeBalance);
    expect(manualBeforeBalance.amount).toBe(-40);

    // Verify chronological order (older first)
    expect(entriesBeforeBalance[0].amount).toBe(-30); // Jan 16 (pending)
    expect(entriesBeforeBalance[1].amount).toBe(-40); // Jan 17 (manual matched)

    // Balance entry should be present
    expect(balanceEntry.isBalanceEntry).toBe(true);
    expect(balanceEntry.balance).toBe(balance);

    // Should have 2 entries after balance: manual entry (isMatched=false) + projected entry
    expect(entriesAfterBalance.length).toBe(2);

    const manualAfterBalance = entriesAfterBalance.find(
      (r) => r.isManualEntry && !r.isMatched,
    );
    const projectedEntry = entriesAfterBalance.find((r) => r.isProjected);

    assert(manualAfterBalance);
    expect(manualAfterBalance.amount).toBe(-50);

    assert(projectedEntry);
    expect(projectedEntry.amount).toBe(-60);

    // Verify running balance calculations for entries before balance
    // Working backwards: 800 - (-40) = 840, then 840 - (-30) = 870
    expect(entriesBeforeBalance[0].balance).toBe(870); // Jan 16 (pending): 870
    expect(entriesBeforeBalance[1].balance).toBe(840); // Jan 17 (manual): 840

    // Verify running balance calculations for entries after balance
    expect(entriesAfterBalance[0].balance).toBe(balance - 50); // 750 (manual)
    expect(entriesAfterBalance[1].balance).toBe(balance - 50 - 60); // 690 (projected)
  });

  it("should explicitly test manual entry placement - isMatched=false goes after balance", () => {
    const balance = 1000;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 1000,
        balance: 1000,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Manual entry with isMatched=false (SHOULD go AFTER balance)
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false, // This is the key: FALSE means AFTER balance
        isPending: false,
        isProjected: false,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: testEntries,
      balance,
      type,
    });

    // Find positions
    const balanceIndex = result.findIndex((r) => r.isBalanceEntry);
    const manualEntryIndex = result.findIndex((r) => r.isManualEntry);

    // Manual entry with isMatched=false should come AFTER balance entry
    expect(manualEntryIndex).toBeGreaterThan(balanceIndex);
    expect(result[manualEntryIndex].isMatched).toBe(false);
    expect(result[manualEntryIndex].isManualEntry).toBe(true);

    // Verify the actual order
    expect(result[balanceIndex].isBalanceEntry).toBe(true);
    expect(result[manualEntryIndex].amount).toBe(-100);
  });

  it("should explicitly test manual entry placement - isMatched=true goes before balance", () => {
    const balance = 1000;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 1000,
        balance: 1000,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Manual entry with isMatched=true (SHOULD go BEFORE balance)
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: true, // This is the key: TRUE means BEFORE balance
        isPending: false,
        isProjected: false,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: testEntries,
      balance,
      type,
    });

    // Find positions
    const balanceIndex = result.findIndex((r) => r.isBalanceEntry);
    const manualEntryIndex = result.findIndex((r) => r.isManualEntry);

    // Manual entry with isMatched=true should come BEFORE balance entry
    expect(manualEntryIndex).toBeLessThan(balanceIndex);
    expect(result[manualEntryIndex].isMatched).toBe(true);
    expect(result[manualEntryIndex].isManualEntry).toBe(true);

    // Verify the actual order
    expect(result[manualEntryIndex].amount).toBe(-100);
    expect(result[balanceIndex].isBalanceEntry).toBe(true);
  });

  it("should handle manual entries with isPending=true and isMatched=false (regression test)", () => {
    const balance = 1000;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
      // Balance entry
      {
        amount: 1000,
        balance: 1000,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Manual entry with isPending=true and isMatched=false
      // This should go AFTER balance, not before (regression test for bug)
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false, // FALSE = should go AFTER balance
        isPending: true, // TRUE = this was causing the bug
        isProjected: false,
      },
      // Regular pending entry (non-manual) should still go before balance
      {
        amount: -50,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-17"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: true, // Regular pending entries should go before balance
        isProjected: false,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: testEntries,
      balance,
      type,
    });

    // Find positions
    const balanceIndex = result.findIndex((r) => r.isBalanceEntry);
    const manualEntryIndex = result.findIndex((r) => r.isManualEntry);
    const regularPendingIndex = result.findIndex(
      (r) => !r.isManualEntry && r.isPending,
    );

    // Manual entry with isPending=true but isMatched=false should STILL go AFTER balance
    expect(manualEntryIndex).toBeGreaterThan(balanceIndex);
    expect(result[manualEntryIndex].isMatched).toBe(false);
    expect(result[manualEntryIndex].isPending).toBe(true);
    expect(result[manualEntryIndex].isManualEntry).toBe(true);

    // Regular pending entry should go BEFORE balance
    expect(regularPendingIndex).toBeLessThan(balanceIndex);
    expect(result[regularPendingIndex].isPending).toBe(true);
    expect(result[regularPendingIndex].isManualEntry).toBe(false);

    // Verify the actual order: [regular pending] -> [balance] -> [manual pending unmatched]
    expect(result[regularPendingIndex].amount).toBe(-50);
    expect(result[balanceIndex].isBalanceEntry).toBe(true);
    expect(result[manualEntryIndex].amount).toBe(-100);
  });

  it("should return sorted entries when balance entry is missing", () => {
    const result = recalculateRunningBalanceAndSort({
      registerEntries: [
        {
          amount: 50,
          balance: 0,
          createdAt: dateTimeService.create("2025-01-03"),
          isBalanceEntry: false,
          isCleared: false,
          isManualEntry: false,
          isMatched: false,
          isPending: false,
          isProjected: true,
          seq: null,
        },
        {
          amount: -100,
          balance: 0,
          createdAt: dateTimeService.create("2025-01-02"),
          isBalanceEntry: false,
          isCleared: false,
          isManualEntry: false,
          isMatched: false,
          isPending: false,
          isProjected: true,
          seq: null,
        },
      ],
      balance: 1000,
      type: "debit",
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.seq)).toEqual([1, 2]);
    expect(result[0].amount).toBe(-100);
    expect(result[0].balance).toBe(900);
    expect(result[1].amount).toBe(50);
    expect(result[1].balance).toBe(950);
  });
});

function randomSort<T>(array: T[]): T[] {
  return array.sort(() => Math.random() - 0.5);
}
