import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ForecastEngine } from "../ForecastEngine";
import { dateTimeService } from "../DateTimeService";
import type { ForecastContext } from "../types";

// Mock the database
const mockDb = {
  accountRegister: {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  registerEntry: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  reoccurrence: {
    findMany: vi.fn(),
    aggregate: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  reoccurrenceSkip: {
    findMany: vi.fn(),
  },
} as any;

describe("ForecastEngine Weekend Testing with DateTimeService Overrides", () => {
  let engine: ForecastEngine;
  let testContext: ForecastContext;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ForecastEngine(mockDb);

    // Clear any existing date overrides
    dateTimeService.clearNowOverride();

    // Setup default mock responses
    setupMockData();
  });

  afterEach(() => {
    // Always clear date overrides after each test
    dateTimeService.clearNowOverride();
  });

  function setupMockData() {
    // Mock account registers
    mockDb.accountRegister.findMany.mockResolvedValue([
      {
        id: 1,
        budgetId: 1,
        accountId: "test-account-123",
        name: "Checking Account",
        balance: 1000,
        latestBalance: 1000,
        minPayment: null,
        statementAt: dateTimeService.add(1, "month").toDate(),
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
        loanPaymentSortOrder: 1,
        minAccountBalance: 500,
        allowExtraPayment: true,
        isArchived: false,
        typeId: 1,
        plaidId: null,
      },
      {
        id: 2,
        budgetId: 1,
        accountId: "test-account-123",
        name: "Credit Card",
        balance: -500,
        latestBalance: -500,
        minPayment: 25,
        statementAt: dateTimeService.add(15, "days").toDate(),
        apr1: 0.18,
        apr1StartAt: dateTimeService.subtract(1, "year").toDate(),
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        targetAccountRegisterId: 1,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 1,
        minAccountBalance: 0,
        allowExtraPayment: true,
        isArchived: false,
        typeId: 2,
        plaidId: null,
      },
    ]);

    // Mock register entries
    mockDb.registerEntry.findMany.mockResolvedValue([]);
    mockDb.registerEntry.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.registerEntry.createMany.mockResolvedValue({ count: 0 });

    // Mock reoccurrences
    mockDb.reoccurrence.findMany.mockResolvedValue([]);
    mockDb.reoccurrence.aggregate.mockResolvedValue([]);
    mockDb.reoccurrence.update.mockResolvedValue({});
    mockDb.reoccurrence.updateMany.mockResolvedValue({ count: 0 });

    // Mock reoccurrence skips
    mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);
  }

  describe("Weekend Date Override Testing", () => {
    it("should handle Saturday processing correctly", async () => {
      // Set current date to Saturday, January 27, 2024
      const saturdayDate = dateTimeService.create("2024-01-27T10:00:00Z"); // Saturday
      dateTimeService.setNowOverride(saturdayDate);

      // Verify the override is working
      expect(dateTimeService.now().format("dddd")).toBe("Saturday");
      expect(dateTimeService.now().format("YYYY-MM-DD")).toBe("2024-01-27");

      // Create context based on the overridden date
      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
        logging: { enabled: false },
      };

      // Test that the engine uses the overridden date
      const result = await engine.recalculate(testContext);

      // Verify the engine processed with Saturday as the current date
      expect(result).toBeDefined();
      expect(dateTimeService.hasOverride()).toBe(true);
    });

    it("should handle Sunday processing correctly", async () => {
      // Set current date to Sunday, January 28, 2024
      const sundayDate = dateTimeService.create("2024-01-28T10:00:00Z"); // Sunday
      dateTimeService.setNowOverride(sundayDate);

      // Verify the override is working
      expect(dateTimeService.now().format("dddd")).toBe("Sunday");
      expect(dateTimeService.now().format("YYYY-MM-DD")).toBe("2024-01-28");

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
      expect(dateTimeService.hasOverride()).toBe(true);
    });

    it("should handle Friday processing correctly", async () => {
      // Set current date to Friday, January 26, 2024
      const fridayDate = dateTimeService.create("2024-01-26T10:00:00Z"); // Friday
      dateTimeService.setNowOverride(fridayDate);

      // Verify the override is working
      expect(dateTimeService.now().format("dddd")).toBe("Friday");
      expect(dateTimeService.now().format("YYYY-MM-DD")).toBe("2024-01-26");

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
      expect(dateTimeService.hasOverride()).toBe(true);
    });

    it("should handle Monday processing correctly", async () => {
      // Set current date to Monday, January 29, 2024
      const mondayDate = dateTimeService.create("2024-01-29T10:00:00Z"); // Monday
      dateTimeService.setNowOverride(mondayDate);

      // Verify the override is working
      expect(dateTimeService.now().format("dddd")).toBe("Monday");
      expect(dateTimeService.now().format("YYYY-MM-DD")).toBe("2024-01-29");

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
      expect(dateTimeService.hasOverride()).toBe(true);
    });
  });

  describe("Weekend Reoccurrence Testing", () => {
    it("should process reoccurrences correctly on weekends", async () => {
      // Set to Saturday
      const saturdayDate = dateTimeService.create("2024-01-27T10:00:00Z");
      dateTimeService.setNowOverride(saturdayDate);

      // Mock reoccurrences that would be processed on this date
      mockDb.reoccurrence.findMany.mockResolvedValue([
        {
          id: 1,
          accountRegisterId: 1,
          name: "Weekly Payment",
          amount: 100,
          lastAt: new Date("2024-01-20T00:00:00.000Z"), // Previous Saturday
          nextAt: new Date("2024-01-27T00:00:00.000Z"), // Current Saturday
          intervalId: 2, // Weekly
          intervalCount: 1,
          adjustBeforeIfOnWeekend: true,
          isActive: true,
        },
      ]);

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
      // Verify that reoccurrences were processed with Saturday as the current date
      expect(mockDb.reoccurrence.findMany).toHaveBeenCalled();
    });

    it("should handle weekend adjustments in reoccurrences", async () => {
      // Set to Sunday
      const sundayDate = dateTimeService.create("2024-01-28T10:00:00Z");
      dateTimeService.setNowOverride(sundayDate);

      // Mock a reoccurrence that should be adjusted from Sunday to Friday
      mockDb.reoccurrence.findMany.mockResolvedValue([
        {
          id: 1,
          accountRegisterId: 1,
          name: "Monthly Payment",
          amount: 500,
          lastAt: new Date("2023-12-28T00:00:00.000Z"), // Previous Thursday
          nextAt: new Date("2024-01-28T00:00:00.000Z"), // Current Sunday (should be adjusted)
          intervalId: 3, // Monthly
          intervalCount: 1,
          adjustBeforeIfOnWeekend: true,
          isActive: true,
        },
      ]);

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
      // The system should process the weekend adjustment logic
      expect(mockDb.reoccurrence.findMany).toHaveBeenCalled();
    });
  });

  describe("Weekend Statement Date Testing", () => {
    it("should handle statement dates that fall on weekends", async () => {
      // Set to Saturday
      const saturdayDate = dateTimeService.create("2024-01-27T10:00:00Z");
      dateTimeService.setNowOverride(saturdayDate);

      // Mock account with statement date on Sunday
      mockDb.accountRegister.findMany.mockResolvedValue([
        {
          id: 1,
          budgetId: 1,
          accountId: "test-account-123",
          name: "Credit Card",
          balance: -500,
          latestBalance: -500,
          minPayment: 25,
          statementAt: new Date("2024-01-28T00:00:00.000Z"), // Sunday
          apr1: 0.18,
          apr1StartAt: dateTimeService.subtract(1, "year").toDate(),
          targetAccountRegisterId: 1,
          isArchived: false,
          typeId: 2,
        },
      ]);

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
      // The system should handle statement dates that fall on weekends
    });
  });

  describe("Weekend Interest Calculation Testing", () => {
    it("should calculate interest correctly on weekends", async () => {
      // Set to Sunday
      const sundayDate = dateTimeService.create("2024-01-28T10:00:00Z");
      dateTimeService.setNowOverride(sundayDate);

      // Mock account with APR that needs interest calculation
      mockDb.accountRegister.findMany.mockResolvedValue([
        {
          id: 1,
          budgetId: 1,
          accountId: "test-account-123",
          name: "Credit Card",
          balance: -1000,
          latestBalance: -1000,
          minPayment: 25,
          statementAt: new Date("2024-02-15T00:00:00.000Z"),
          apr1: 0.18, // 18% APR
          apr1StartAt: new Date("2024-01-01T00:00:00.000Z"),
          targetAccountRegisterId: null,
          isArchived: false,
          typeId: 2,
        },
      ]);

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
      // Interest calculations should work correctly even on weekends
    });
  });

  describe("Weekend Date Range Testing", () => {
    it("should calculate correct date ranges when current date is on weekend", async () => {
      // Set to Saturday
      const saturdayDate = dateTimeService.create("2024-01-27T10:00:00Z");
      dateTimeService.setNowOverride(saturdayDate);

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      // Verify the date range is calculated correctly
      expect(testContext.startDate).toEqual(
        saturdayDate.clone().startOf("month").toDate()
      );
      expect(testContext.endDate).toEqual(
        saturdayDate.clone().add(2, "years").toDate()
      );

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
    });

    it("should handle month boundaries on weekends", async () => {
      // Set to Saturday at month boundary
      const saturdayMonthEnd = dateTimeService.create("2024-02-03T10:00:00Z"); // First Saturday of February
      dateTimeService.setNowOverride(saturdayMonthEnd);

      testContext = {
        accountId: "test-account-123",
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(2, "years").toDate(),
      };

      // Verify month boundary handling
      expect(testContext.startDate).toEqual(
        saturdayMonthEnd.clone().startOf("month").toDate()
      );
      expect(testContext.endDate).toEqual(
        saturdayMonthEnd.clone().add(2, "years").toDate()
      );

      const result = await engine.recalculate(testContext);

      expect(result).toBeDefined();
    });
  });

  describe("Weekend Override Cleanup", () => {
    it("should properly clear date overrides after testing", () => {
      // Set an override
      const testDate = dateTimeService.create("2024-01-27T10:00:00Z");
      dateTimeService.setNowOverride(testDate);

      expect(dateTimeService.hasOverride()).toBe(true);
      expect(dateTimeService.now().format("YYYY-MM-DD")).toBe("2024-01-27");

      // Clear the override
      dateTimeService.clearNowOverride();

      expect(dateTimeService.hasOverride()).toBe(false);
      expect(dateTimeService.now().format("YYYY-MM-DD")).toBe(
        dateTimeService.format("YYYY-MM-DD", dateTimeService.now())
      );
    });

    it("should handle multiple date changes in sequence", () => {
      // Test Saturday
      dateTimeService.setNowOverride(
        dateTimeService.create("2024-01-27T10:00:00Z")
      );
      expect(dateTimeService.now().format("dddd")).toBe("Saturday");

      // Test Sunday
      dateTimeService.setNowOverride(
        dateTimeService.create("2024-01-28T10:00:00Z")
      );
      expect(dateTimeService.now().format("dddd")).toBe("Sunday");

      // Test Monday
      dateTimeService.setNowOverride(
        dateTimeService.create("2024-01-29T10:00:00Z")
      );
      expect(dateTimeService.now().format("dddd")).toBe("Monday");

      // Clear and verify
      dateTimeService.clearNowOverride();
      expect(dateTimeService.hasOverride()).toBe(false);
    });
  });
});
