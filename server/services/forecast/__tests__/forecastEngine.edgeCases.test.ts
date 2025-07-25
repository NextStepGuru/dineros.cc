import { vi, describe, it, expect, beforeEach } from "vitest";
import { ForecastEngine } from "../ForecastEngine";
import { ModernCacheService } from "../ModernCacheService";
import { RegisterEntryService } from "../RegisterEntryService";
import { ReoccurrenceService } from "../ReoccurrenceService";
import { TransferService } from "../TransferService";
import { AccountRegisterService } from "../AccountRegisterService";
import { LoanCalculatorService } from "../LoanCalculatorService";
import type { ForecastContext } from "../types";

// Dynamic moment import
let moment: any;

describe("ForecastEngine - Edge Cases and Error Handling", () => {
  let forecastEngine: ForecastEngine;
  let cache: ModernCacheService;
  let entryService: RegisterEntryService;
  let reoccurrenceService: ReoccurrenceService;
  let transferService: TransferService;
  let accountRegisterService: AccountRegisterService;
  let loanCalculator: LoanCalculatorService;

  beforeEach(async () => {
    moment = (await import("moment")).default;
    const mockDb = {
      accountRegister: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      registerEntry: {
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      reoccurrence: {
        findMany: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: null } }),
      },
      reoccurrenceSkip: {
        findMany: vi.fn(),
      },
    } as any;

    forecastEngine = new ForecastEngine(mockDb);
  });

  describe("calculateStartDate - Edge Cases", () => {
    it("should handle null/undefined minDate", () => {
      const result = forecastEngine["calculateStartDate"](null as any);
      expect(result.isValid()).toBe(false);
    });

    it("should handle invalid date string", () => {
      const result = forecastEngine["calculateStartDate"](
        "invalid-date" as any
      );
      expect(result.isValid()).toBe(false);
    });

    it("should handle date with time components", () => {
      const dateWithTime = new Date("2024-01-15T14:30:45.123Z");
      const result = forecastEngine["calculateStartDate"](dateWithTime);

      expect(result.hour()).toBe(0);
      expect(result.minute()).toBe(0);
      expect(result.second()).toBe(0);
      expect(result.millisecond()).toBe(0);
    });
  });

  describe("calculateEndDate - Edge Cases", () => {
    it("should calculate end date correctly", () => {
      const result = forecastEngine["calculateEndDate"]();
      const expected = moment()
        .set({
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        })
        .add({ year: 10 }); // MAX_YEARS = 10

      expect(result.isValid()).toBe(true);
      expect(result.diff(expected, "days")).toBeLessThan(1); // Allow for small time differences
    });
  });

  describe("loadExistingEntries - Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      // Disable logging for this test
      const { forecastLogger } = await import("../logger");
      forecastLogger.setConfig({ enabled: false });

      const mockAccountData = {
        registerEntries: [
          {
            id: "1",
            accountRegisterId: 1,
            description: "Test Entry",
            amount: 100,
            isManualEntry: true,
            isBalanceEntry: false,
            isPending: false,
            createdAt: moment().toDate(),
          },
        ],
      };

      // Mock the entry service to throw an error
      const mockEntryService = {
        createEntry: vi.fn().mockImplementation(() => {
          throw new Error("Entry creation failed");
        }),
      };

      (forecastEngine as any).entryService = mockEntryService;

      await expect(
        forecastEngine["loadExistingEntries"](
          mockAccountData,
          moment().toDate()
        )
      ).rejects.toThrow("Entry creation failed");
    });

    it("should handle empty entries array", async () => {
      const mockAccountData = {
        registerEntries: [],
      };

      const mockEntryService = {
        createEntry: vi.fn(),
      };

      (forecastEngine as any).entryService = mockEntryService;

      await forecastEngine["loadExistingEntries"](
        mockAccountData,
        moment().toDate()
      );

      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
    });

    it("should handle entries with missing required fields", async () => {
      // Disable logging for this test
      const { forecastLogger } = await import("../logger");
      forecastLogger.setConfig({ enabled: false });

      const mockAccountData = {
        registerEntries: [
          {
            id: "1",
            // Missing accountRegisterId
            description: "Test Entry",
            amount: 100,
            isManualEntry: true,
            isBalanceEntry: false,
            isPending: false,
            createdAt: moment().toDate(),
          },
        ],
      };

      const mockEntryService = {
        createEntry: vi.fn().mockImplementation(() => {
          throw new Error("Missing required fields");
        }),
      };

      (forecastEngine as any).entryService = mockEntryService;

      await expect(
        forecastEngine["loadExistingEntries"](
          mockAccountData,
          moment().toDate()
        )
      ).rejects.toThrow("Missing required fields");
    });
  });

  describe("processForecastTimeline - Error Handling", () => {
    it("should handle errors in timeline processing", async () => {
      // Disable logging for this test
      const { forecastLogger } = await import("../logger");
      forecastLogger.setConfig({ enabled: false });

      const startDate = moment("2024-01-01");
      const endDate = moment("2024-01-05");

      // Mock services to throw errors
      const mockTransferService = {
        processExtraDebtPayments: vi
          .fn()
          .mockRejectedValue(new Error("Transfer failed")),
        processSavingsGoals: vi.fn(),
      };

      const mockAccountService = {
        getAccountsWithExtraPayments: vi.fn().mockReturnValue([]),
        getInterestBearingAccounts: vi.fn().mockReturnValue([]),
        processInterestCharges: vi.fn(),
      };

      const mockReoccurrenceService = {
        getReoccurrencesDue: vi.fn().mockReturnValue([]),
        processReoccurrences: vi.fn(),
      };

      (forecastEngine as any).transferService = mockTransferService;
      (forecastEngine as any).accountService = mockAccountService;
      (forecastEngine as any).reoccurrenceService = mockReoccurrenceService;

      await expect(
        forecastEngine["processForecastTimeline"](startDate, endDate)
      ).rejects.toThrow("Transfer failed");
    });

    it("should handle very long timeline periods", async () => {
      const startDate = moment("2024-01-01");
      const endDate = moment("2034-01-01"); // 10 years

      const mockTransferService = {
        processExtraDebtPayments: vi.fn(),
        processSavingsGoals: vi.fn(),
      };

      const mockAccountService = {
        getAccountsWithExtraPayments: vi.fn().mockReturnValue([]),
        getInterestBearingAccounts: vi.fn().mockReturnValue([]),
        processInterestCharges: vi.fn(),
        updateStatementDates: vi.fn(),
      };

      const mockReoccurrenceService = {
        getReoccurrencesDue: vi.fn().mockReturnValue([]),
        processReoccurrences: vi.fn(),
      };

      (forecastEngine as any).transferService = mockTransferService;
      (forecastEngine as any).accountService = mockAccountService;
      (forecastEngine as any).reoccurrenceService = mockReoccurrenceService;

      await forecastEngine["processForecastTimeline"](startDate, endDate);

      // Should process many days without errors
      expect(mockTransferService.processExtraDebtPayments).toHaveBeenCalled();
    });
  });

  describe("loadManualEntriesForDate - Error Handling", () => {
    it("should handle database errors when loading manual entries", async () => {
      // Disable logging for this test
      const { forecastLogger } = await import("../logger");
      forecastLogger.setConfig({ enabled: false });

      const testDate = moment("2024-01-15");

      // Mock the cache to throw an error
      const mockCache = {
        registerEntry: {
          find: vi.fn().mockImplementation(() => {
            throw new Error("Database connection failed");
          }),
        },
      };

      (forecastEngine as any).cache = mockCache;

      await expect(
        forecastEngine["loadManualEntriesForDate"](testDate)
      ).rejects.toThrow("Database connection failed");
    });

    it("should handle empty manual entries result", async () => {
      const testDate = moment("2024-01-15");

      // Mock the entry service to return an empty array
      const mockEntryService = {
        createEntry: vi.fn(),
      };

      (forecastEngine as any).entryService = mockEntryService;

      await forecastEngine["loadManualEntriesForDate"](testDate);

      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
    });
  });

  describe("processAccountEntries - Error Handling", () => {
    it("should handle errors in account processing", async () => {
      // Disable logging for this test
      const { forecastLogger } = await import("../logger");
      forecastLogger.setConfig({ enabled: false });

      const mockAccountRegisters = [
        {
          id: 1,
          accountId: "test-account",
          balance: 1000,
        },
      ];

      // Mock the cache to return entries
      const mockCache = {
        registerEntry: {
          find: vi.fn().mockReturnValue([
            {
              id: "1",
              accountRegisterId: 1,
              isBalanceEntry: false,
            },
          ]),
        },
      };

      // Mock the entry service to throw an error
      const mockEntryService = {
        filterSkippedEntries: vi.fn().mockReturnValue([]),
        calculateRunningBalances: vi.fn().mockImplementation(() => {
          throw new Error("Balance calculation failed");
        }),
        updateEntryStatuses: vi.fn(),
      };

      (forecastEngine as any).cache = mockCache;
      (forecastEngine as any).entryService = mockEntryService;

      await expect(
        forecastEngine["processAccountEntries"](mockAccountRegisters)
      ).rejects.toThrow("Balance calculation failed");
    });

    it("should handle empty account registers array", async () => {
      const result = await forecastEngine["processAccountEntries"]([]);
      expect(result).toEqual([]);
    });
  });

  describe("convertToFinalFormat - Edge Cases", () => {
    it("should handle entries with null values", () => {
      const mockResults = [
        {
          id: "1",
          accountRegisterId: 1,
          description: "Test Entry",
          amount: 100,
          balance: 1000,
          createdAt: moment().toDate(),
          isBalanceEntry: false,
          isPending: false,
          isCleared: false,
          isProjected: false,
          isManualEntry: false,
          isReconciled: false,
          reoccurrenceId: null,
          sourceAccountRegisterId: null,
          seq: null,
        },
      ];

      const result = forecastEngine["convertToFinalFormat"](mockResults);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("should handle empty results array", () => {
      const result = forecastEngine["convertToFinalFormat"]([]);
      expect(result).toEqual([]);
    });
  });

  describe("validateResults - Error Handling", () => {
    it("should handle validation errors gracefully", async () => {
      // Disable logging for this test
      const { forecastLogger } = await import("../logger");
      forecastLogger.setConfig({ enabled: false });

      // Mock the cache to throw an error
      const mockCache = {
        registerEntry: {
          find: vi.fn().mockImplementation(() => {
            throw new Error("Cache access failed");
          }),
        },
      };

      (forecastEngine as any).cache = mockCache;

      const result = await forecastEngine.validateResults({
        accountId: "test-account",
        startDate: moment("2024-01-01").toDate(),
        endDate: moment("2024-12-31").toDate(),
      });

      expect(result).toBe(false);
    });

    it("should return false for invalid results", async () => {
      const mockCache = {
        registerEntry: {
          find: vi.fn().mockReturnValue([]),
        },
      };

      (forecastEngine as any).cache = mockCache;

      const result = await forecastEngine.validateResults({
        accountId: "test-account",
        startDate: moment("2024-01-01").toDate(),
        endDate: moment("2024-12-31").toDate(),
      });

      expect(result).toBe(false);
    });
  });

  describe("getCache - Access Control", () => {
    it("should return the cache instance", () => {
      const mockCache = { test: "cache" };
      (forecastEngine as any).cache = mockCache;

      const result = forecastEngine.getCache();
      expect(result).toBe(mockCache);
    });
  });

  describe("Date Range Validation", () => {
    it("should throw error when forecast date range exceeds 10 years", async () => {
      // Disable logging for this test
      const { forecastLogger } = await import("../logger");
      forecastLogger.setConfig({ enabled: false });

      const mockDb = {
        accountRegister: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        registerEntry: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        reoccurrence: {
          findMany: vi.fn().mockResolvedValue([]),
          aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: null } }),
        },
        reoccurrenceSkip: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const engine = new ForecastEngine(mockDb);

      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2035-01-01"), // 11 years later
        logging: { enabled: false },
      };

      const result = await engine.recalculate(context);
      expect(result.isSuccess).toBe(false);
      expect(result.errors?.[0]).toContain(
        "Forecast date range exceeds 10 years"
      );
    });

    it("should allow forecast date range of exactly 10 years", async () => {
      const mockDb = {
        accountRegister: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        registerEntry: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        reoccurrence: {
          findMany: vi.fn().mockResolvedValue([]),
          aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: null } }),
        },
        reoccurrenceSkip: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const engine = new ForecastEngine(mockDb);

      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2034-01-01"), // Exactly 10 years later
        logging: { enabled: false },
      };

      // Should not throw an error
      const result = await engine.recalculate(context);
      expect(result.isSuccess).toBe(true);
    });
  });
});
