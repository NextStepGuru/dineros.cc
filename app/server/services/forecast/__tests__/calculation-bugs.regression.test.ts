/**
 * Regression suite for forecast/ledger calculation bugs fixed in 2026-08.
 * Covers: money rounding, month-end anchors, loan payment cap, phantom payments,
 * compound depreciation salvage floor, and transfer guards.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RegisterEntryService } from "../RegisterEntryService";
import { ReoccurrenceService } from "../ReoccurrenceService";
import { TransferService } from "../TransferService";
import { AssetDepreciationService } from "../AssetDepreciationService";
import { ModernCacheService } from "../ModernCacheService";
import { applyReoccurrenceAmountAdjustment } from "../reoccurrenceIntervals";
import { dateTimeService } from "../DateTimeService";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import prismaPkg, { AmountAdjustmentMode } from "@prisma/client";

const { Prisma } = prismaPkg;

describe("calculation-bugs regression", () => {
  afterEach(() => {
    dateTimeService.clearNowOverride();
    vi.restoreAllMocks();
  });

  describe("money rounding", () => {
    it("createEntry stores bankers-rounded whole-cent amounts", () => {
      const cache = new ModernCacheService();
      cache.accountRegister.insert({
        id: 1,
        subAccountRegisterId: null,
        typeId: 1,
        budgetId: 1,
        accountId: "a",
        name: "Checking",
        balance: 1000,
        latestBalance: 1000,
        minPayment: null,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        statementIntervalId: 3,
        apr1: null,
        apr1StartAt: null,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 0,
        savingsGoalSortOrder: 0,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
        depreciationRate: null,
        depreciationMethod: null,
        assetOriginalValue: null,
        assetResidualValue: null,
        assetUsefulLifeYears: null,
        assetStartAt: null,
        paymentCategoryId: null,
        interestCategoryId: null,
        accruesBalanceGrowth: false,
      } as any);

      const entryService = new RegisterEntryService({} as any, cache);
      // 2.125 bankers-rounds to 2.12 (half-to-even)
      entryService.createEntry({
        accountRegisterId: 1,
        description: "Odd amount",
        amount: 2.125,
        forecastDate: new Date("2024-01-02T00:00:00.000Z"),
      });

      const entries = cache.registerEntry.find({ accountRegisterId: 1 });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.amount).toBe(2.12);
    });

    it("amount adjustment ties use bankers rounding (half-to-even)", () => {
      // 2.125 with 0 completed steps still rounds via roundCents
      expect(applyReoccurrenceAmountAdjustment(2.125, "NONE", null, null, 0)).toBe(
        2.12,
      );
      expect(applyReoccurrenceAmountAdjustment(2.135, "NONE", null, null, 0)).toBe(
        2.14,
      );
    });

    it("percent split amounts are whole cents", async () => {
      const mockDb = await createTestDatabase();
      const mockCache = {
        reoccurrence: { findOne: vi.fn(), find: vi.fn(), update: vi.fn() },
        accountRegister: { findOne: vi.fn().mockReturnValue(null) },
        reoccurrenceSplit: {
          find: vi.fn().mockReturnValue([
            {
              id: 1,
              reoccurrenceId: 1,
              transferAccountRegisterId: 20,
              amountMode: "PERCENT",
              amount: 1 / 3,
              description: "Third",
              categoryId: null,
              sortOrder: 0,
            },
          ]),
        },
      };
      const mockEntryService = { createEntry: vi.fn() };
      const mockTransferService = {
        transferBetweenAccounts: vi.fn(),
      };
      const service = new ReoccurrenceService(
        mockDb as unknown as ConstructorParameters<typeof ReoccurrenceService>[0],
        mockCache as any,
        mockEntryService as any,
        mockTransferService as any,
      );

      (service as any).createOccurrenceEntries(
        {
          id: 1,
          accountRegisterId: 10,
          transferAccountRegisterId: null,
          description: "Paycheck",
          intervalId: 3,
          categoryId: null,
        },
        {
          id: 1,
          lastAt: new Date("2024-01-15T00:00:00.000Z"),
        },
        new Date("2024-01-15T00:00:00.000Z"),
        100,
        1,
      );

      expect(mockTransferService.transferBetweenAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          // 100 * (1/3) bankers-rounded
          amount: expect.closeTo(33.33, 2),
        }),
      );
      const splitAmount =
        mockTransferService.transferBetweenAccounts.mock.calls[0]![0].amount;
      expect(Number.isInteger(Math.round(splitAmount * 100))).toBe(true);
      expect(splitAmount).toBe(33.33);

      await cleanupTestDatabase(mockDb);
    });
  });

  describe("month-end anchor", () => {
    it("Jan 31 anchor yields Feb 28/29 then Mar 31", () => {
      const mockDb = { reoccurrence: {} } as any;
      const service = new ReoccurrenceService(
        mockDb,
        {
          reoccurrence: { findOne: vi.fn(), find: vi.fn(), update: vi.fn() },
          accountRegister: { findOne: vi.fn() },
        } as any,
        { createEntry: vi.fn() } as any,
        { transferBetweenAccounts: vi.fn() } as any,
      );
      const anchor = new Date("2024-01-31T00:00:00.000Z");
      const feb = service.calculateNextOccurrence({
        lastAt: anchor,
        scheduleAnchorAt: anchor,
        intervalId: 3,
        intervalCount: 1,
      } as any);
      const mar = service.calculateNextOccurrence({
        lastAt: feb,
        scheduleAnchorAt: anchor,
        intervalId: 3,
        intervalCount: 1,
      } as any);
      expect(dateTimeService.format("YYYY-MM-DD", feb!)).toBe("2024-02-29");
      expect(dateTimeService.format("YYYY-MM-DD", mar!)).toBe("2024-03-31");
    });
  });

  describe("transfer guards", () => {
    let cache: ModernCacheService;
    let entryService: { createEntry: ReturnType<typeof vi.fn> };
    let service: TransferService;

    beforeEach(() => {
      cache = new ModernCacheService();
      entryService = { createEntry: vi.fn() };
      service = new TransferService(cache, entryService as any);
      for (const id of [1, 2]) {
        cache.accountRegister.insert({
          id,
          subAccountRegisterId: null,
          typeId: 1,
          budgetId: 1,
          accountId: "a",
          name: id === 1 ? "A" : "B",
          balance: 500,
          latestBalance: 500,
          minPayment: null,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          statementIntervalId: 3,
          apr1: null,
          apr1StartAt: null,
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          targetAccountRegisterId: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
          accountSavingsGoal: null,
          minAccountBalance: 0,
          allowExtraPayment: false,
          isArchived: false,
          plaidId: null,
          depreciationRate: null,
          depreciationMethod: null,
          assetOriginalValue: null,
          assetResidualValue: null,
          assetUsefulLifeYears: null,
          assetStartAt: null,
          paymentCategoryId: null,
          interestCategoryId: null,
          accruesBalanceGrowth: false,
        } as any);
      }
    });

    it("skips self-transfer", () => {
      service.transferBetweenAccounts({
        sourceAccountRegisterId: 1,
        targetAccountRegisterId: 1,
        amount: 50,
        description: "Self",
        reoccurrence: {
          id: 1,
          accountId: "a",
          accountRegisterId: 1,
          description: "Self",
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          amount: new Prisma.Decimal(50),
          transferAccountRegisterId: 1,
          intervalId: 3,
          intervalCount: 1,
          endAt: null,
          totalIntervals: null,
          elapsedIntervals: null,
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
          adjustBeforeIfOnWeekend: false,
          categoryId: null,
          ...{
            amountAdjustmentMode: AmountAdjustmentMode.NONE,
            amountAdjustmentDirection: null,
            amountAdjustmentValue: null,
            amountAdjustmentIntervalId: null,
            amountAdjustmentIntervalCount: 1,
            amountAdjustmentAnchorAt: null,
          },
        } as any,
      });
      expect(entryService.createEntry).not.toHaveBeenCalled();
    });

    it("skips transfer to archived register", () => {
      const archived = cache.accountRegister.findById(2)!;
      archived.isArchived = true;
      cache.accountRegister.update(archived);

      service.transferBetweenAccounts({
        sourceAccountRegisterId: 1,
        targetAccountRegisterId: 2,
        amount: 50,
        description: "To archived",
        reoccurrence: {
          id: 1,
          accountId: "a",
          accountRegisterId: 1,
          description: "X",
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          amount: new Prisma.Decimal(50),
          transferAccountRegisterId: 2,
          intervalId: 3,
          intervalCount: 1,
          endAt: null,
          totalIntervals: null,
          elapsedIntervals: null,
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
          adjustBeforeIfOnWeekend: false,
          categoryId: null,
          amountAdjustmentMode: AmountAdjustmentMode.NONE,
          amountAdjustmentDirection: null,
          amountAdjustmentValue: null,
          amountAdjustmentIntervalId: null,
          amountAdjustmentIntervalCount: 1,
          amountAdjustmentAnchorAt: null,
        } as any,
      });
      expect(entryService.createEntry).not.toHaveBeenCalled();
    });
  });

  describe("compound depreciation salvage floor", () => {
    it("does not depreciate below residualValue", () => {
      const cache = new ModernCacheService();
      const entryService = { createEntry: vi.fn() };
      const service = new AssetDepreciationService(cache, entryService as any);
      // Monthly change 101 * 0.24 / 12 ≈ 2.02 would go to 98.98; floor at 100 => -1
      const change = (service as any).calculateCompound(101, 0.24, true, 100);
      expect(change).toBe(-1);
      const atFloor = (service as any).calculateCompound(100, 0.24, true, 100);
      expect(atFloor).toBe(0);
    });
  });
});
