import { describe, it, expect, vi, beforeEach } from "vitest";

// Global H3 function mocks
(globalThis as any).defineEventHandler = vi.fn((handler) => handler);
(globalThis as any).readBody = vi.fn();
(globalThis as any).createError = vi.fn((error) => {
  const statusCode = error.statusCode || 500;
  const message = error.statusMessage || error.message || "Unknown error";
  const fullMessage = `HTTP ${statusCode}: ${message}`;
  const err = new Error(fullMessage) as any;
  err.statusCode = statusCode;
  err.statusMessage = message;
  throw err;
});
(globalThis as any).getQuery = vi.fn();

// Mock services and clients
const mockEngine = {
  recalculate: vi.fn(),
};

const mockEngineFactory = {
  create: vi.fn().mockReturnValue(mockEngine),
};

const mockPrisma = {
  accountRegister: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
};

const mockHandleApiError = vi.fn();

// Mock schema
const mockRecalculateSchema = {
  parse: vi.fn(),
};

// Mock DateTime chain object
const mockMoment = vi.fn(() => ({
  startOf: vi.fn().mockReturnThis(),
  add: vi.fn().mockReturnThis(),
  toDate: vi.fn().mockReturnValue(new Date("2024-01-01T00:00:00.000Z")),
}));

// Mock imports
vi.mock("~/server/services/forecast", () => ({
  ForecastEngineFactory: mockEngineFactory,
  dateTimeService: {
    now: vi.fn(() => mockMoment()),
  },
}));

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: mockPrisma,
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: mockHandleApiError,
}));

vi.mock("~/schema/zod", () => ({
  recalculateSchema: mockRecalculateSchema,
}));

vi.mock("~/consts", () => ({
  MAX_YEARS: 2,
}));

describe("Recalculate API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset DateTime chain mock implementation
    mockMoment.mockImplementation(() => ({
      startOf: vi.fn().mockReturnThis(),
      add: vi.fn().mockReturnThis(),
      toDate: vi.fn().mockReturnValue(new Date("2024-01-01T00:00:00.000Z")),
    }));

    // Reset engine factory to default behavior
    mockEngineFactory.create.mockReturnValue(mockEngine);
  });

  describe("POST /api/recalculate", () => {
    let recalculatePostHandler: any;

    beforeEach(async () => {
      const module = await import("~/server/api/recalculate.post");
      recalculatePostHandler = module.default;
    });

    it("should successfully recalculate for valid account ID", async () => {
      const mockEvent = { body: { accountId: "account-123" } } as any;
      const mockBody = { accountId: "account-123" };

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      mockRecalculateSchema.parse.mockReturnValue({ accountId: "account-123" });

      mockEngine.recalculate.mockResolvedValue({
        isSuccess: true,
        registerEntries: [
          { id: 1, isBalanceEntry: false },
          { id: 2, isBalanceEntry: true },
          { id: 3, isBalanceEntry: false },
        ],
        accountRegisters: [
          { id: 1, accountId: "account-123" },
          { id: 2, accountId: "account-123" },
        ],
      });

      const result = await recalculatePostHandler(mockEvent);

      expect(result).toEqual({
        success: true,
        entriesCalculated: 3,
        entriesBalance: 1,
        accountRegisters: 2,
      });

      expect(mockEngineFactory.create).toHaveBeenCalledWith(mockPrisma);
      expect(mockEngine.recalculate).toHaveBeenCalledWith({
        accountId: "account-123",
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        logging: { enabled: false },
      });
    });

    it("should handle missing account ID", async () => {
      const mockEvent = { body: { accountId: "" } } as any;
      const mockBody = { accountId: "" };

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      mockRecalculateSchema.parse.mockReturnValue({ accountId: "" });

      await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
        "Account ID is required to recalculate account balances",
      );
    });

    it("should handle null account ID", async () => {
      const mockEvent = {} as any;
      const mockBody = {};

      (globalThis as any).readBody.mockResolvedValue(mockBody);

      await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
        "Account ID is required to recalculate account balances",
      );
    });

    it("should handle forecast calculation failure", async () => {
      const mockEvent = { body: { accountId: "account-123" } } as any;
      const mockBody = { accountId: "account-123" };

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      mockRecalculateSchema.parse.mockReturnValue({ accountId: "account-123" });

      mockEngine.recalculate.mockResolvedValue({
        isSuccess: false,
        errors: ["Database connection failed", "Invalid date range"],
      });

      await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
        "Forecast calculation failed: Database connection failed, Invalid date range",
      );
    });

    it("should handle forecast calculation failure without errors", async () => {
      const mockEvent = { body: { accountId: "account-123" } } as any;
      const mockBody = { accountId: "account-123" };

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      mockRecalculateSchema.parse.mockReturnValue({ accountId: "account-123" });

      mockEngine.recalculate.mockResolvedValue({
        isSuccess: false,
      });

      await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
        "Forecast calculation failed: undefined",
      );
    });

    it("should handle schema validation errors", async () => {
      const mockEvent = {} as any;

      (globalThis as any).readBody.mockResolvedValue(123);

      await expect(recalculatePostHandler(mockEvent)).rejects.toThrow();
      expect(mockHandleApiError).toHaveBeenCalled();
    });

    it("should handle engine creation errors", async () => {
      const mockEvent = { body: { accountId: "account-123" } } as any;
      const mockBody = { accountId: "account-123" };

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      mockRecalculateSchema.parse.mockReturnValue({ accountId: "account-123" });

      mockEngineFactory.create.mockImplementation(() => {
        throw new Error("Engine creation failed");
      });

      await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
        "Engine creation failed",
      );
      expect(mockHandleApiError).toHaveBeenCalled();
    });

    it("should handle database connection errors", async () => {
      const mockEvent = { body: { accountId: "account-123" } } as any;
      const mockBody = { accountId: "account-123" };

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      mockRecalculateSchema.parse.mockReturnValue({ accountId: "account-123" });

      // Reset engine factory to return working engine
      mockEngineFactory.create.mockReturnValue(mockEngine);
      mockEngine.recalculate.mockRejectedValue(
        new Error("Database connection lost"),
      );

      await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
        "Database connection lost",
      );
      expect(mockHandleApiError).toHaveBeenCalled();
    });

    it("should use correct date range for calculation", async () => {
      const mockEvent = { body: { accountId: "account-123" } } as any;
      const mockBody = { accountId: "account-123" };

      const mockStartDate = new Date("2024-01-01T00:00:00.000Z");
      const mockEndDate = new Date("2026-01-01T00:00:00.000Z");

      const mockMomentChain = {
        startOf: vi.fn().mockReturnThis(),
        add: vi.fn().mockReturnThis(),
        toDate: vi.fn(),
      };

      mockMomentChain.toDate
        .mockReturnValueOnce(mockStartDate) // First call for startDate
        .mockReturnValueOnce(mockEndDate); // Second call for endDate

      mockMoment.mockReturnValue(mockMomentChain);

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      mockRecalculateSchema.parse.mockReturnValue({ accountId: "account-123" });

      // Reset engine factory to return working engine
      mockEngineFactory.create.mockReturnValue(mockEngine);
      mockEngine.recalculate.mockResolvedValue({
        isSuccess: true,
        registerEntries: [],
        accountRegisters: [],
      });

      await recalculatePostHandler(mockEvent);

      expect(mockMomentChain.startOf).toHaveBeenCalledWith("month");
      expect(mockMomentChain.add).toHaveBeenCalledWith(2, "years");
      expect(mockEngine.recalculate).toHaveBeenCalledWith({
        accountId: "account-123",
        startDate: mockStartDate,
        endDate: mockEndDate,
        logging: { enabled: false },
      });
    });
  });

  describe("GET /api/tasks/recalculate", () => {
    let recalculateTaskHandler: any;

    beforeEach(async () => {
      const module = await import("~/server/api/tasks/recalculate");
      recalculateTaskHandler = module.default;
    });

    it("should successfully recalculate single account via query parameter", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({ accountId: "account-123" });
      mockPrisma.accountRegister.findFirst.mockResolvedValue({
        id: 1,
        accountId: "account-123",
        isArchived: false,
      });

      // Reset engine factory to return working engine
      mockEngineFactory.create.mockReturnValue(mockEngine);
      mockEngine.recalculate.mockResolvedValue({
        isSuccess: true,
        registerEntries: [
          { id: 1, isProjected: true, isBalanceEntry: false },
          { id: 2, isProjected: false, isBalanceEntry: false },
          { id: 3, isProjected: false, isBalanceEntry: true },
        ],
        accountRegisters: [{ id: 1, accountId: "account-123" }],
      });

      const result = await recalculateTaskHandler(mockEvent);

      expect(result).toEqual({
        success: true,
        processedAccounts: 1,
        totalEntriesCalculated: 3,
        totalAccountRegisters: 1,
        failedAccounts: undefined,
        results: {
          accountId: "account-123",
          success: true,
          entriesCalculated: 3,
          entriesProjected: 1,
          entriesHistorical: 1,
          entriesBalance: 1,
          accountRegisters: 1,
        },
      });

      expect(mockPrisma.accountRegister.findFirst).toHaveBeenCalledWith({
        where: { accountId: "account-123", isArchived: false },
      });
    });

    it("should handle single account not found", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({
        accountId: "nonexistent-account",
      });
      mockPrisma.accountRegister.findFirst.mockResolvedValue(null);

      const result = await recalculateTaskHandler(mockEvent);

      expect(result).toEqual({
        success: false,
        message: "Account nonexistent-account not found in database.",
        entriesCalculated: 0,
        accountRegisters: 0,
      });
    });

    it("should successfully recalculate all accounts when no query parameter", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({});
      mockPrisma.accountRegister.findMany.mockResolvedValue([
        { accountId: "account-1" },
        { accountId: "account-2" },
      ]);

      // Reset engine factory to return working engine
      mockEngineFactory.create.mockReturnValue(mockEngine);
      mockEngine.recalculate
        .mockResolvedValueOnce({
          isSuccess: true,
          registerEntries: [
            { id: 1, isProjected: true, isBalanceEntry: false },
            { id: 2, isProjected: false, isBalanceEntry: true },
          ],
          accountRegisters: [{ id: 1 }],
        })
        .mockResolvedValueOnce({
          isSuccess: true,
          registerEntries: [
            { id: 3, isProjected: false, isBalanceEntry: false },
            { id: 4, isProjected: true, isBalanceEntry: false },
            { id: 5, isProjected: false, isBalanceEntry: true },
          ],
          accountRegisters: [{ id: 2 }, { id: 3 }],
        });

      const result = await recalculateTaskHandler(mockEvent);

      expect(result).toEqual({
        success: true,
        processedAccounts: 2,
        totalEntriesCalculated: 5,
        totalAccountRegisters: 3,
        failedAccounts: undefined,
        results: [
          {
            accountId: "account-1",
            success: true,
            entriesCalculated: 2,
            entriesProjected: 1,
            entriesHistorical: 0,
            entriesBalance: 1,
            accountRegisters: 1,
          },
          {
            accountId: "account-2",
            success: true,
            entriesCalculated: 3,
            entriesProjected: 1,
            entriesHistorical: 1,
            entriesBalance: 1,
            accountRegisters: 2,
          },
        ],
      });

      expect(mockPrisma.accountRegister.findMany).toHaveBeenCalledWith({
        where: { isArchived: false, account: { isArchived: false } },
        select: { accountId: true },
        distinct: ["accountId"],
      });
    });

    it("should handle no accounts found in database", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({});
      mockPrisma.accountRegister.findMany.mockResolvedValue([]);

      const result = await recalculateTaskHandler(mockEvent);

      expect(result).toEqual({
        success: false,
        message:
          "No accounts found in database. Please create an account first.",
        entriesCalculated: 0,
        accountRegisters: 0,
      });
    });

    it("should handle mixed success and failure scenarios", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({});
      mockPrisma.accountRegister.findMany.mockResolvedValue([
        { accountId: "account-success" },
        { accountId: "account-failure" },
        { accountId: "account-error" },
      ]);

      // Create separate engine instances for each account
      const mockEngine1 = { recalculate: vi.fn() };
      const mockEngine2 = { recalculate: vi.fn() };
      const mockEngine3 = { recalculate: vi.fn() };

      mockEngineFactory.create
        .mockReturnValueOnce(mockEngine1)
        .mockReturnValueOnce(mockEngine2)
        .mockReturnValueOnce(mockEngine3);

      mockEngine1.recalculate.mockResolvedValue({
        isSuccess: true,
        registerEntries: [{ id: 1, isProjected: false, isBalanceEntry: false }],
        accountRegisters: [{ id: 1 }],
      });

      mockEngine2.recalculate.mockResolvedValue({
        isSuccess: false,
        errors: ["Calculation failed"],
      });

      mockEngine3.recalculate.mockRejectedValue(new Error("Database error"));

      const result = await recalculateTaskHandler(mockEvent);

      expect(result).toEqual({
        success: true,
        processedAccounts: 1,
        totalEntriesCalculated: 1,
        totalAccountRegisters: 1,
        failedAccounts: [
          {
            accountId: "account-failure",
            errors: ["Calculation failed"],
          },
          {
            accountId: "account-error",
            errors: ["Database error"],
          },
        ],
        results: [
          {
            accountId: "account-success",
            success: true,
            entriesCalculated: 1,
            entriesProjected: 0,
            entriesHistorical: 1,
            entriesBalance: 0,
            accountRegisters: 1,
          },
        ],
      });
    });

    it("should handle calculation failure without errors array", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({});
      mockPrisma.accountRegister.findMany.mockResolvedValue([
        { accountId: "account-failure" },
      ]);

      // Reset engine factory to return working engine
      mockEngineFactory.create.mockReturnValue(mockEngine);
      mockEngine.recalculate.mockResolvedValue({
        isSuccess: false,
      });

      const result = await recalculateTaskHandler(mockEvent);

      expect(result.failedAccounts).toEqual([
        {
          accountId: "account-failure",
          errors: ["Unknown error"],
        },
      ]);
    });

    it("should handle non-Error exceptions", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({});
      mockPrisma.accountRegister.findMany.mockResolvedValue([
        { accountId: "account-error" },
      ]);

      // Reset engine factory to return working engine
      mockEngineFactory.create.mockReturnValue(mockEngine);
      mockEngine.recalculate.mockRejectedValue("String error");

      const result = await recalculateTaskHandler(mockEvent);

      expect(result.failedAccounts).toEqual([
        {
          accountId: "account-error",
          errors: ["Unknown error"],
        },
      ]);
    });

    it("should use correct date range with MAX_YEARS", async () => {
      const mockEvent = {} as any;

      const mockStartDate = new Date("2024-01-01T00:00:00.000Z");
      const mockEndDate = new Date("2026-01-01T00:00:00.000Z");

      const mockMomentChain = {
        startOf: vi.fn().mockReturnThis(),
        add: vi.fn().mockReturnThis(),
        toDate: vi.fn(),
      };

      mockMomentChain.toDate
        .mockReturnValueOnce(mockStartDate) // First call for startDate
        .mockReturnValueOnce(mockEndDate); // Second call for endDate

      mockMoment.mockReturnValue(mockMomentChain);

      (globalThis as any).getQuery.mockReturnValue({ accountId: "account-123" });
      mockPrisma.accountRegister.findFirst.mockResolvedValue({
        id: 1,
        accountId: "account-123",
      });

      // Reset engine factory to return working engine
      mockEngineFactory.create.mockReturnValue(mockEngine);
      mockEngine.recalculate.mockResolvedValue({
        isSuccess: true,
        registerEntries: [],
        accountRegisters: [],
      });

      await recalculateTaskHandler(mockEvent);

      expect(mockMomentChain.startOf).toHaveBeenCalledWith("month");
      expect(mockMomentChain.add).toHaveBeenCalledWith(2, "years"); // MAX_YEARS = 2
      expect(mockEngine.recalculate).toHaveBeenCalledWith({
        accountId: "account-123",
        startDate: mockStartDate,
        endDate: mockEndDate,
        logging: { enabled: false },
      });
    });

    it("should create fresh engine instances for each account", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({});
      mockPrisma.accountRegister.findMany.mockResolvedValue([
        { accountId: "account-1" },
        { accountId: "account-2" },
      ]);

      mockEngine.recalculate.mockResolvedValue({
        isSuccess: true,
        registerEntries: [],
        accountRegisters: [],
      });

      await recalculateTaskHandler(mockEvent);

      // Engine factory should be called twice (once for each account)
      expect(mockEngineFactory.create).toHaveBeenCalledTimes(2);
      expect(mockEngineFactory.create).toHaveBeenNthCalledWith(1, mockPrisma);
      expect(mockEngineFactory.create).toHaveBeenNthCalledWith(2, mockPrisma);
    });

    it("should handle database query errors for account lookup", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({ accountId: "account-123" });
      mockPrisma.accountRegister.findFirst.mockRejectedValue(
        new Error("Database connection failed"),
      );

      await expect(recalculateTaskHandler(mockEvent)).rejects.toThrow(
        "Database connection failed",
      );
    });

    it("should handle database query errors for finding all accounts", async () => {
      const mockEvent = {} as any;

      (globalThis as any).getQuery.mockReturnValue({});
      mockPrisma.accountRegister.findMany.mockRejectedValue(
        new Error("Database connection failed"),
      );

      await expect(recalculateTaskHandler(mockEvent)).rejects.toThrow(
        "Database connection failed",
      );
    });
  });

  describe("Cross-endpoint Integration", () => {
    it("should use the same ForecastEngineFactory in both endpoints", async () => {
      // Test POST endpoint
      const postModule = await import("~/server/api/recalculate.post");
      const postHandler = postModule.default;

      // Reset engine factory to return working engine
      mockEngineFactory.create.mockReturnValue(mockEngine);

      const mockEvent = { body: { accountId: "account-123" } } as any;
      (globalThis as any).readBody.mockResolvedValue({ accountId: "account-123" });
      mockRecalculateSchema.parse.mockReturnValue({ accountId: "account-123" });
      mockEngine.recalculate.mockResolvedValue({
        isSuccess: true,
        registerEntries: [],
        accountRegisters: [],
      });

      await postHandler(mockEvent);

      // Test task endpoint
      vi.clearAllMocks();
      mockEngineFactory.create.mockReturnValue(mockEngine);

      const taskModule = await import("~/server/api/tasks/recalculate");
      const taskHandler = taskModule.default;

      (globalThis as any).getQuery.mockReturnValue({ accountId: "account-123" });
      mockPrisma.accountRegister.findFirst.mockResolvedValue({
        id: 1,
        accountId: "account-123",
      });
      mockEngine.recalculate.mockResolvedValue({
        isSuccess: true,
        registerEntries: [],
        accountRegisters: [],
      });

      await taskHandler({} as any);

      // Both should call the same factory
      expect(mockEngineFactory.create).toHaveBeenCalledWith(mockPrisma);
    });
  });
});
