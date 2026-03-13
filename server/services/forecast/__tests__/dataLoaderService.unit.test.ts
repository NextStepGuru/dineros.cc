import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataLoaderService } from "../DataLoaderService";
import { ModernCacheService } from "../ModernCacheService";
import type { ForecastContext } from "../types";
import { dateTimeService } from "../DateTimeService";

describe("DataLoaderService", () => {
  let dataLoader: DataLoaderService;
  let mockDb: any;
  let mockCache: ModernCacheService;

  beforeEach(() => {
    mockDb = {
      accountRegister: {
        findMany: vi.fn(),
      },
      registerEntry: {
        findMany: vi.fn(),
      },
      reoccurrence: {
        findMany: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: null } }),
      },
      reoccurrenceSkip: {
        findMany: vi.fn(),
      },
    };

    mockCache = new ModernCacheService();
    dataLoader = new DataLoaderService(mockDb, mockCache);

    vi.clearAllMocks();
  });

  describe("loadAccountData", () => {
    it("should load all account data successfully", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-12-31"),
      };

      // Mock database responses
      const mockAccountRegisters = [
        {
          id: 1,
          accountId: "test-account",
          name: "Checking",
          balance: 1000,
          typeId: 1,
          statementAt: new Date("2023-01-01"),
          isArchived: false,
        },
      ];

      const mockRegisterEntries = [
        {
          id: 1,
          accountRegisterId: 1,
          description: "Test Entry",
          amount: 100,
          createdAt: new Date("2023-01-01"),
          isCleared: false,
          isProjected: false,
        },
      ];

      const mockReoccurrences = [
        {
          id: 1,
          accountRegisterId: 1,
          description: "Monthly Salary",
          amount: 5000,
          intervalId: 1,
          lastAt: new Date("2023-01-01"),
        },
      ];

      const mockReoccurrenceSkips = [
        {
          id: 1,
          reoccurrenceId: 1,
          skipAt: new Date("2023-02-01"),
        },
      ];

      mockDb.accountRegister.findMany.mockResolvedValue(mockAccountRegisters);
      mockDb.registerEntry.findMany.mockResolvedValue(mockRegisterEntries);
      mockDb.reoccurrence.findMany.mockResolvedValue(mockReoccurrences);
      mockDb.reoccurrenceSkip.findMany.mockResolvedValue(mockReoccurrenceSkips);

      const result = await dataLoader.loadAccountData(context);

      expect(result.accountRegisters).toHaveLength(1);
      expect(result.registerEntries).toHaveLength(1);
      expect(result.reoccurrences).toHaveLength(1);
      expect(result.reoccurrenceSkips).toHaveLength(1);

      expect(result.accountRegisters[0].name).toBe("Checking");
      expect(result.registerEntries[0].description).toBe("Test Entry");
      expect(result.reoccurrences[0].description).toBe("Monthly Salary");
      expect(result).toHaveProperty("minReoccurrenceDate");
    });

    it("should clear cache before loading new data", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      // Add some existing data to cache
      mockCache.accountRegister.insert({
        id: 999,
        budgetId: 1,
        accountId: "old-account",
        name: "Old Account",
        balance: 500,
        latestBalance: 500,
        minPayment: 0,
        statementAt: dateTimeService.create(),
        statementIntervalId: 1,
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
        typeId: 1,
        plaidId: null,
      });

      mockDb.accountRegister.findMany.mockResolvedValue([]);
      mockDb.registerEntry.findMany.mockResolvedValue([]);
      mockDb.reoccurrence.findMany.mockResolvedValue([]);
      mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);

      await dataLoader.loadAccountData(context);

      // Cache should be cleared
      const cachedAccounts = mockCache.accountRegister.find({});
      expect(cachedAccounts).toHaveLength(0);
    });

    it("should handle empty database responses", async () => {
      const context: ForecastContext = {
        accountId: "empty-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      mockDb.accountRegister.findMany.mockResolvedValue([]);
      mockDb.registerEntry.findMany.mockResolvedValue([]);
      mockDb.reoccurrence.findMany.mockResolvedValue([]);
      mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);

      const result = await dataLoader.loadAccountData(context);

      expect(result.accountRegisters).toEqual([]);
      expect(result.registerEntries).toEqual([]);
      expect(result.reoccurrences).toEqual([]);
      expect(result.reoccurrenceSkips).toEqual([]);
      expect(result.minReoccurrenceDate).toBeNull();
    });

    it("should filter out cleared entries from register entries", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      const mockRegisterEntries = [
        {
          id: 1,
          description: "Pending Entry",
          isCleared: false,
          isProjected: false,
          createdAt: new Date(),
        },
        {
          id: 2,
          description: "Cleared Entry",
          isCleared: true,
          isProjected: false,
          createdAt: new Date(),
        },
      ];

      mockDb.accountRegister.findMany.mockResolvedValue([]);
      mockDb.registerEntry.findMany.mockResolvedValue(mockRegisterEntries);
      mockDb.reoccurrence.findMany.mockResolvedValue([]);
      mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);

      await dataLoader.loadAccountData(context);

      // Should call with filter for cleared entries
      expect(mockDb.registerEntry.findMany).toHaveBeenCalledWith({
        where: {
          register: { accountId: "test-account" },
          isCleared: false,
          OR: [{ isProjected: false }],
        },
        orderBy: [{ createdAt: "asc" }, { amount: "desc" }],
      });
    });
  });

  describe("getMinReoccurrenceDate", () => {
    it("should return minimum lastAt date from reoccurrences", async () => {
      const mockAggregateResult = {
        _min: {
          lastAt: new Date("2023-01-15"),
        },
      };

      mockDb.reoccurrence.aggregate.mockResolvedValue(mockAggregateResult);

      const result = await dataLoader.getMinReoccurrenceDate("test-account");

      expect(result).toEqual(new Date("2023-01-15"));
      expect(mockDb.reoccurrence.aggregate).toHaveBeenCalledWith({
        where: { register: { accountId: "test-account" } },
        _min: { lastAt: true },
      });
    });

    it("should return null when no reoccurrences exist", async () => {
      mockDb.reoccurrence.aggregate.mockResolvedValue({
        _min: { lastAt: null },
      });

      const result = await dataLoader.getMinReoccurrenceDate("test-account");

      expect(result).toBeNull();
    });

    it("should handle undefined aggregate result", async () => {
      mockDb.reoccurrence.aggregate.mockResolvedValue(null);

      const result = await dataLoader.getMinReoccurrenceDate("test-account");

      expect(result).toBeNull();
    });
  });

  describe("Database Error Handling", () => {
    it("should handle account register loading errors", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      mockDb.accountRegister.findMany.mockRejectedValue(
        new Error("Database connection failed")
      );

      await expect(dataLoader.loadAccountData(context)).rejects.toThrow(
        "Database connection failed"
      );
    });

    it("should handle register entry loading errors", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      mockDb.accountRegister.findMany.mockResolvedValue([]);
      mockDb.registerEntry.findMany.mockRejectedValue(
        new Error("Register entry query failed")
      );

      await expect(dataLoader.loadAccountData(context)).rejects.toThrow(
        "Register entry query failed"
      );
    });

    it("should handle reoccurrence loading errors", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      mockDb.accountRegister.findMany.mockResolvedValue([]);
      mockDb.registerEntry.findMany.mockResolvedValue([]);
      mockDb.reoccurrence.findMany.mockRejectedValue(
        new Error("Reoccurrence query failed")
      );

      await expect(dataLoader.loadAccountData(context)).rejects.toThrow(
        "Reoccurrence query failed"
      );
    });
  });

  describe("Data Transformation", () => {
    it("should convert dates to moment objects correctly", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      const mockAccountRegisters = [
        {
          id: 1,
          accountId: "test-account",
          name: "Test Account",
          balance: 1000,
          statementAt: new Date("2023-06-15T10:30:00.000Z"),
          typeId: 1,
          isArchived: false,
        },
      ];

      mockDb.accountRegister.findMany.mockResolvedValue(mockAccountRegisters);
      mockDb.registerEntry.findMany.mockResolvedValue([]);
      mockDb.reoccurrence.findMany.mockResolvedValue([]);
      mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);

      const result = await dataLoader.loadAccountData(context);

      // Check that statementAt is converted to moment
      expect(
        dateTimeService.isValid(result.accountRegisters[0].statementAt)
      ).toBe(true);
      expect(
        dateTimeService.format(
          "YYYY-MM-DD",
          result.accountRegisters[0].statementAt
        )
      ).toBe("2023-06-15");
    });

    it("should preserve all account register fields", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      const mockAccountRegister = {
        id: 1,
        budgetId: "budget-123",
        accountId: "test-account",
        name: "Test Account",
        balance: 1500.5,
        latestBalance: 1400.25,
        minPayment: 50,
        statementAt: new Date("2023-06-15"),
        apr1: 0.15,
        apr1StartAt: new Date("2023-01-01"),
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        targetAccountRegisterId: 2,
        loanStartAt: new Date("2023-01-01"),
        loanPaymentsPerYear: 12,
        loanTotalYears: 30,
        loanOriginalAmount: 250000,
        loanPaymentSortOrder: 1,
        minAccountBalance: 100,
        allowExtraPayment: true,
        isArchived: false,
        typeId: 1,
        plaidId: "plaid-123",
      };

      mockDb.accountRegister.findMany.mockResolvedValue([mockAccountRegister]);
      mockDb.registerEntry.findMany.mockResolvedValue([]);
      mockDb.reoccurrence.findMany.mockResolvedValue([]);
      mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);

      const result = await dataLoader.loadAccountData(context);
      const loadedAccount = result.accountRegisters[0];

      expect(loadedAccount.id).toBe(1);
      expect(loadedAccount.budgetId).toBe("budget-123");
      expect(loadedAccount.name).toBe("Test Account");
      expect(loadedAccount.balance).toBe(1500.5);
      expect(loadedAccount.latestBalance).toBe(1400.25);
      expect(loadedAccount.minPayment).toBe(50);
      expect(loadedAccount.apr1).toBe(0.15);
      expect(loadedAccount.targetAccountRegisterId).toBe(2);
      expect(loadedAccount.loanPaymentsPerYear).toBe(12);
      expect(loadedAccount.allowExtraPayment).toBe(true);
    });
  });

  describe("Cache Integration", () => {
    it("should populate cache with loaded data", async () => {
      const context: ForecastContext = {
        accountId: "test-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      const mockAccountRegisters = [
        {
          id: 1,
          accountId: "test-account",
          name: "Test Account",
          balance: 1000,
          typeId: 1,
          statementAt: new Date(),
          isArchived: false,
        },
      ];

      const mockRegisterEntries = [
        {
          id: 1,
          accountRegisterId: 1,
          description: "Test Entry",
          amount: 100,
          createdAt: new Date(),
          isCleared: false,
          isProjected: false,
        },
      ];

      mockDb.accountRegister.findMany.mockResolvedValue(mockAccountRegisters);
      mockDb.registerEntry.findMany.mockResolvedValue(mockRegisterEntries);
      mockDb.reoccurrence.findMany.mockResolvedValue([]);
      mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);

      await dataLoader.loadAccountData(context);

      // Check that data was inserted into cache
      const cachedAccounts = mockCache.accountRegister.find({});
      const cachedEntries = mockCache.registerEntry.find({});

      expect(cachedAccounts).toHaveLength(1);
      expect(cachedEntries).toHaveLength(1);
      expect(cachedAccounts[0].name).toBe("Test Account");
      expect(cachedEntries[0].description).toBe("Test Entry");
    });

    it("should handle large datasets efficiently", async () => {
      const context: ForecastContext = {
        accountId: "large-account",
        startDate: new Date(),
        endDate: new Date(),
      };

      // Generate large dataset
      const manyAccountRegisters = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        accountId: "large-account",
        name: `Account ${i + 1}`,
        balance: Math.random() * 10000,
        typeId: 1,
        statementAt: new Date(),
        isArchived: false,
      }));

      const manyRegisterEntries = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        accountRegisterId: (i % 50) + 1,
        description: `Entry ${i + 1}`,
        amount: Math.random() * 1000,
        createdAt: new Date(),
        isCleared: false,
        isProjected: false,
      }));

      mockDb.accountRegister.findMany.mockResolvedValue(manyAccountRegisters);
      mockDb.registerEntry.findMany.mockResolvedValue(manyRegisterEntries);
      mockDb.reoccurrence.findMany.mockResolvedValue([]);
      mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);

      const start = Date.now();
      const result = await dataLoader.loadAccountData(context);
      const duration = Date.now() - start;

      expect(result.accountRegisters).toHaveLength(50);
      expect(result.registerEntries).toHaveLength(1000);
      expect(duration).toBeLessThan(1000); // Should complete quickly

      // Verify cache contains all data
      const cachedAccounts = mockCache.accountRegister.find({});
      const cachedEntries = mockCache.registerEntry.find({});
      expect(cachedAccounts).toHaveLength(50);
      expect(cachedEntries).toHaveLength(1000);
    });
  });
});
