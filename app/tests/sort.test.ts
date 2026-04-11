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
      // Posted but uncleared (isPending false) — still before balance anchor
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

    // Verify order: cleared entries, real uncleared before balance, balance entry, projected after
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

    // Verify entries before balance are non-projected uncleared (pending + posted)
    expect(pendingBeforeBalance.length).toBe(3);
    expect(pendingBeforeBalance.every((r) => !r.isProjected)).toBe(true);

    // Verify chronological order (older first)
    expect(pendingBeforeBalance[0].amount).toBe(-50); // Jan 16 (older)
    expect(pendingBeforeBalance[1].amount).toBe(-25); // Jan 17
    expect(pendingBeforeBalance[2].amount).toBe(-100); // Jan 18 posted uncleared

    // Verify balance entry
    expect(balanceEntry.isBalanceEntry).toBe(true);
    expect(balanceEntry.balance).toBe(balance);

    expect(pendingAfterBalance.length).toBe(1);
    expect(pendingAfterBalance[0].isProjected).toBe(true);

    // Backward from balance: Jan 18 (-100), Jan 17 (-25), Jan 16 (-50)
    expect(pendingBeforeBalance[0].balance).toBe(1175); // Jan 16
    expect(pendingBeforeBalance[1].balance).toBe(1125); // Jan 17
    expect(pendingBeforeBalance[2].balance).toBe(1100); // Jan 18

    expect(pendingAfterBalance[0].balance).toBe(balance - 200); // 800 projected
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

    // Should have 3 real (non-projected) uncleared rows before balance
    expect(pendingBeforeBalance.length).toBe(3);
    expect(pendingBeforeBalance.every((r) => !r.isProjected)).toBe(true);

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
      // Posted uncleared — sorts before the balance anchor
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
    expect(balanceEntryIndex).toBe(1);

    const beforeBalance = result.slice(0, balanceEntryIndex);
    const balanceEntry = result[balanceEntryIndex];
    const pendingAfterBalance = result.slice(balanceEntryIndex + 1);

    expect(beforeBalance.length).toBe(1);
    expect(beforeBalance[0].amount).toBe(-100);
    expect(beforeBalance[0].balance).toBe(1100);
    expect(balanceEntry.balance).toBe(balance);
    expect(pendingAfterBalance.length).toBe(0);
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

  it("should keep posted import before balance and all manuals after balance", () => {
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
      // Manual entry with isMatched=true (after balance row)
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
      // Manual entry with isMatched=false (after balance row)
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
      // Posted uncleared import (before balance)
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

    expect(entriesBeforeBalance.length).toBe(1);
    expect(entriesBeforeBalance[0].amount).toBe(-100);
    expect(entriesBeforeBalance[0].isManualEntry).toBe(false);

    expect(balanceEntry.isBalanceEntry).toBe(true);
    expect(balanceEntry.balance).toBe(balance);

    expect(entriesAfterBalance.length).toBe(2);
    expect(entriesAfterBalance[0].amount).toBe(-50);
    expect(entriesAfterBalance[0].isManualEntry).toBe(true);
    expect(entriesAfterBalance[1].amount).toBe(-75);
    expect(entriesAfterBalance[1].isManualEntry).toBe(true);

    expect(entriesBeforeBalance[0].balance).toBe(1100);

    expect(entriesAfterBalance[0].balance).toBe(950);
    expect(entriesAfterBalance[1].balance).toBe(875);
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
      // Manual entry with isMatched=true (after balance)
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
      // Another manual entry with isMatched=true (after balance)
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

    expect(entriesBeforeBalance.length).toBe(0);

    expect(balanceEntry.isBalanceEntry).toBe(true);
    expect(balanceEntry.balance).toBe(balance);

    expect(entriesAfterBalance.length).toBe(4);
    expect(entriesAfterBalance.every((r) => r.isManualEntry)).toBe(true);
    expect(entriesAfterBalance[0].amount).toBe(25);
    expect(entriesAfterBalance[1].amount).toBe(50);
    expect(entriesAfterBalance[2].amount).toBe(75);
    expect(entriesAfterBalance[3].amount).toBe(100);

    expect(entriesAfterBalance[0].balance).toBe(525);
    expect(entriesAfterBalance[1].balance).toBe(575);
    expect(entriesAfterBalance[2].balance).toBe(650);
    expect(entriesAfterBalance[3].balance).toBe(750);
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
      // Manual entry with isMatched=true (after balance row)
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
      // Manual entry with isMatched=false (after balance row)
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

    expect(entriesBeforeBalance.length).toBe(1);
    expect(entriesBeforeBalance[0].amount).toBe(-30);
    expect(entriesBeforeBalance[0].isPending).toBe(true);
    expect(entriesBeforeBalance[0].isManualEntry).toBe(false);

    expect(balanceEntry.isBalanceEntry).toBe(true);
    expect(balanceEntry.balance).toBe(balance);

    expect(entriesAfterBalance.length).toBe(3);
    expect(entriesAfterBalance[0].amount).toBe(-40);
    expect(entriesAfterBalance[0].isManualEntry).toBe(true);
    expect(entriesAfterBalance[1].amount).toBe(-50);
    expect(entriesAfterBalance[1].isManualEntry).toBe(true);
    expect(entriesAfterBalance[2].amount).toBe(-60);
    expect(entriesAfterBalance[2].isProjected).toBe(true);

    expect(entriesBeforeBalance[0].balance).toBe(830);

    expect(entriesAfterBalance[0].balance).toBe(760);
    expect(entriesAfterBalance[1].balance).toBe(710);
    expect(entriesAfterBalance[2].balance).toBe(650);
  });

  it("should place non-pending manual entries after balance row", () => {
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
      // Manual entry with isMatched=false (after balance row)
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
    ];

    const result = recalculateRunningBalanceAndSort({
      registerEntries: testEntries,
      balance,
      type,
    });

    const balanceIndex = result.findIndex((r) => r.isBalanceEntry);
    const manualEntryIndex = result.findIndex((r) => r.isManualEntry);

    expect(manualEntryIndex).toBeGreaterThan(balanceIndex);
    expect(result[manualEntryIndex].isMatched).toBe(false);
    expect(result[manualEntryIndex].isManualEntry).toBe(true);
    expect(result[balanceIndex].isBalanceEntry).toBe(true);
    expect(result[manualEntryIndex].amount).toBe(-100);
    expect(result[manualEntryIndex].balance).toBe(900);
  });

  it("should place isMatched=true manual entries after balance row", () => {
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
      // Manual entry with isMatched=true (after balance row)
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: true,
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

    expect(manualEntryIndex).toBeGreaterThan(balanceIndex);
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
      // Manual pending (unmatched) — after balance row with non-manual pending before
      {
        amount: -100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-16"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false,
        isPending: true,
        isProjected: false,
      },
      // Regular pending entry (non-manual) before balance
      {
        amount: -50,
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
      registerEntries: testEntries,
      balance,
      type,
    });

    const balanceIndex = result.findIndex((r) => r.isBalanceEntry);
    const manualEntryIndex = result.findIndex((r) => r.isManualEntry);
    const regularPendingIndex = result.findIndex(
      (r) => !r.isManualEntry && r.isPending,
    );

    expect(manualEntryIndex).toBeGreaterThan(balanceIndex);
    expect(regularPendingIndex).toBeLessThan(balanceIndex);
    expect(result[manualEntryIndex].isPending).toBe(true);
    expect(result[manualEntryIndex].isManualEntry).toBe(true);

    expect(regularPendingIndex).toBeLessThan(manualEntryIndex);
    expect(result[regularPendingIndex].amount).toBe(-50);
    expect(result[balanceIndex].isBalanceEntry).toBe(true);
    expect(result[manualEntryIndex].amount).toBe(-100);
    expect(result[regularPendingIndex].balance).toBe(1050);
    expect(result[manualEntryIndex].balance).toBe(900);
  });

  it("should interleave manual and non-manual entries after balance by date", () => {
    const balance = 1000;
    const type = "debit";

    const testEntries: PartialRegisterEntry[] = [
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
      // Non-manual projected (Apr 5)
      {
        amount: -9,
        balance: 0,
        createdAt: dateTimeService.create("2025-04-05"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: true,
      },
      // Manual entry (May 15) — later date than non-manual above
      {
        amount: -500,
        balance: 0,
        createdAt: dateTimeService.create("2025-05-15"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      // Non-manual projected (Apr 6)
      {
        amount: -10,
        balance: 0,
        createdAt: dateTimeService.create("2025-04-06"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: true,
      },
      // Non-manual projected (Apr 7)
      {
        amount: -250,
        balance: 0,
        createdAt: dateTimeService.create("2025-04-07"),
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
    const afterBalance = result.slice(balanceEntryIndex + 1);

    expect(afterBalance.length).toBe(4);
    // All entries sorted by date regardless of manual vs non-manual
    expect(afterBalance[0].amount).toBe(-9);   // Apr 5 (non-manual)
    expect(afterBalance[1].amount).toBe(-10);  // Apr 6 (non-manual)
    expect(afterBalance[2].amount).toBe(-250); // Apr 7 (non-manual)
    expect(afterBalance[3].amount).toBe(-500); // May 15 (manual)

    // Forward running balance from 1000
    expect(afterBalance[0].balance).toBe(991);
    expect(afterBalance[1].balance).toBe(981);
    expect(afterBalance[2].balance).toBe(731);
    expect(afterBalance[3].balance).toBe(231);
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

  /**
   * Forecast passes `undefined` so the anchor comes from the synthetic balance row (negative pocket).
   * Explicit `balance: 0` must not be treated as "omit" — that was the `??` bug (zeroed anchor).
   */
  it("uses synthetic balance row when balance omitted; explicit zero stays zero anchor (debit)", () => {
    const pocketNegativeAnchor: PartialRegisterEntry[] = [
      {
        amount: -164.98,
        balance: -164.98,
        createdAt: dateTimeService.create("2025-01-15"),
        isBalanceEntry: true,
        isCleared: true,
        isManualEntry: false,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
      {
        amount: 100,
        balance: 0,
        createdAt: dateTimeService.create("2025-01-20"),
        isBalanceEntry: false,
        isCleared: false,
        isManualEntry: true,
        isMatched: false,
        isPending: false,
        isProjected: false,
      },
    ];

    const fromRow = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(pocketNegativeAnchor)),
      balance: undefined,
      type: "debit",
    });
    const manualFromRow = fromRow.find((r) => !r.isBalanceEntry);
    expect(manualFromRow?.balance).toBeCloseTo(-64.98, 2);

    const zeroAnchor = recalculateRunningBalanceAndSort({
      registerEntries: randomSort(cloneDeep(pocketNegativeAnchor)),
      balance: 0,
      type: "debit",
    });
    const manualZero = zeroAnchor.find((r) => !r.isBalanceEntry);
    expect(manualZero?.balance).toBe(100);
    const balZero = zeroAnchor.find((r) => r.isBalanceEntry);
    expect(balZero?.amount).toBe(0);
    expect(balZero?.balance).toBe(0);
  });
});

function randomSort<T>(array: T[]): T[] {
  return array.sort(() => Math.random() - 0.5);
}
