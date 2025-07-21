import { describe, it, expect, beforeEach, vi } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
  // Make readBody available globally before any imports
  (globalThis as any).readBody = vi.fn();
  // Make createError available globally before any imports
  (globalThis as any).createError = vi.fn((error) => {
    const err = new Error(
      error.statusMessage || error.message || "Unknown error"
    );
    (err as any).statusCode = error.statusCode || 500;
    throw err;
  });
});

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  readBody: vi.fn(),
  createError: vi.fn((error) => {
    const err = new Error(
      error.statusMessage || error.message || "Unknown error"
    );
    (err as any).statusCode = error.statusCode || 500;
    throw err;
  }),
}));

// Make H3 functions globally available
(global as any).readBody = vi.fn();

// Mock dependencies
vi.mock("~/schema/zod", () => ({
  recalculateSchema: {
    parse: vi.fn(),
  },
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/services/forecast", () => ({
  ForecastEngineFactory: {
    create: vi.fn(),
  },
  dateTimeService: {
    now: vi.fn(() => ({
      startOf: vi.fn(() => ({
        toDate: vi.fn(() => new Date("2024-01-01")),
      })),
      add: vi.fn(() => ({
        toDate: vi.fn(() => new Date("2026-01-01")),
      })),
    })),
  },
}));

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {},
}));

vi.mock("moment", () => ({
  default: vi.fn(() => ({
    startOf: vi.fn(() => ({
      toDate: vi.fn(() => new Date("2024-01-01")),
    })),
    add: vi.fn(() => ({
      toDate: vi.fn(() => new Date("2026-01-01")),
    })),
  })),
}));

describe("Recalculate POST API Endpoint", () => {
  let recalculatePostHandler: any;
  let mockEngine: any;

  beforeEach(async () => {
    // Mock engine
    mockEngine = {
      recalculate: vi.fn(),
    };

    // Properly set up the global mock function
    (global as any).readBody = vi.fn();

    const module = await import("../recalculate.post");
    recalculatePostHandler = module.default;
  });

  it("should successfully recalculate account balances", async () => {
    const mockEvent = {};
    const mockBody = { accountId: "account123" };
    const mockResult = {
      isSuccess: true,
      registerEntries: [
        { id: 1, isBalanceEntry: false },
        { id: 2, isBalanceEntry: true },
        { id: 3, isBalanceEntry: false },
      ],
      accountRegisters: [
        { id: 1, accountId: "account123" },
        { id: 2, accountId: "account123" },
      ],
      errors: null,
    };

    const { readBody } = await import("h3");
    const { recalculateSchema } = await import("~/schema/zod");
    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );
    const { prisma } = await import("~/server/clients/prismaClient");

    // Set up mocks properly
    (readBody as any).mockResolvedValue(mockBody);
    (recalculateSchema.parse as any).mockReturnValue({
      accountId: "account123",
    });
    (ForecastEngineFactory.create as any).mockReturnValue(mockEngine);
    (mockEngine.recalculate as any).mockResolvedValue(mockResult);

    const result = await recalculatePostHandler(mockEvent);

    expect(ForecastEngineFactory.create).toHaveBeenCalledWith(prisma);
    expect(mockEngine.recalculate).toHaveBeenCalledWith({
      accountId: "account123",
      startDate: expect.any(Date),
      endDate: expect.any(Date),
    });
    expect(result).toEqual({
      success: true,
      entriesCalculated: 3,
      entriesBalance: 1,
      accountRegisters: 2,
    });
  });

  it("should handle missing account ID", async () => {
    const mockEvent = {};
    const mockBody = {};

    const { readBody } = await import("h3");
    const { recalculateSchema } = await import("~/schema/zod");

    (readBody as any).mockResolvedValue(mockBody);
    (recalculateSchema.parse as any).mockImplementation(() => {
      throw new Error("accountId is required");
    });

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "accountId is required"
    );
  });

  it("should handle empty account ID", async () => {
    const mockEvent = {};
    const mockBody = { accountId: "" };

    const { readBody } = await import("h3");
    const { recalculateSchema } = await import("~/schema/zod");

    (readBody as any).mockResolvedValue(mockBody);
    (recalculateSchema.parse as any).mockImplementation(() => {
      throw new Error("accountId cannot be empty");
    });

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "accountId cannot be empty"
    );
  });

  it("should handle forecast calculation failure", async () => {
    const mockEvent = {};
    const mockBody = { accountId: "account123" };
    const mockResult = {
      isSuccess: false,
      registerEntries: [],
      accountRegisters: [],
      errors: ["Database connection failed", "Invalid account data"],
    };

    const { readBody } = await import("h3");
    const { recalculateSchema } = await import("~/schema/zod");
    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );

    (readBody as any).mockResolvedValue(mockBody);
    (recalculateSchema.parse as any).mockReturnValue({
      accountId: "account123",
    });
    (ForecastEngineFactory.create as any).mockReturnValue(mockEngine);
    (mockEngine.recalculate as any).mockResolvedValue(mockResult);

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "Forecast calculation failed"
    );
  });

  it("should handle engine recalculation errors", async () => {
    const mockEvent = {};
    const mockBody = { accountId: "account123" };

    const { readBody } = await import("h3");
    const { recalculateSchema } = await import("~/schema/zod");
    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );

    (readBody as any).mockResolvedValue(mockBody);
    (recalculateSchema.parse as any).mockReturnValue({
      accountId: "account123",
    });
    (ForecastEngineFactory.create as any).mockReturnValue(mockEngine);
    (mockEngine.recalculate as any).mockRejectedValue(
      new Error("Engine recalculation failed")
    );

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "Engine recalculation failed"
    );
  });

  it("should handle schema validation errors", async () => {
    const mockEvent = {};
    const mockBody = { invalidField: "value" };

    const { readBody } = await import("h3");
    const { recalculateSchema } = await import("~/schema/zod");

    (readBody as any).mockResolvedValue(mockBody);
    (recalculateSchema.parse as any).mockImplementation(() => {
      throw new Error("Invalid schema");
    });

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "Invalid schema"
    );
  });

  it("should use correct date range for recalculation", async () => {
    const mockEvent = {};
    const mockBody = { accountId: "account123" };
    const mockResult = {
      isSuccess: true,
      registerEntries: [
        { id: 1, isBalanceEntry: false },
        { id: 2, isBalanceEntry: true },
      ],
      accountRegisters: [{ id: 1, accountId: "account123" }],
      errors: null,
    };

    const { readBody } = await import("h3");
    const { recalculateSchema } = await import("~/schema/zod");
    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );
    const { prisma } = await import("~/server/clients/prismaClient");

    (readBody as any).mockResolvedValue(mockBody);
    (recalculateSchema.parse as any).mockReturnValue({
      accountId: "account123",
    });
    (ForecastEngineFactory.create as any).mockReturnValue(mockEngine);
    (mockEngine.recalculate as any).mockResolvedValue(mockResult);

    const result = await recalculatePostHandler(mockEvent);

    expect(mockEngine.recalculate).toHaveBeenCalledWith({
      accountId: "account123",
      startDate: expect.any(Date),
      endDate: expect.any(Date),
    });
    expect(result).toEqual({
      success: true,
      entriesCalculated: 2,
      entriesBalance: 1,
      accountRegisters: 1,
    });
  });

  it("should return correct statistics for successful recalculation", async () => {
    const mockEvent = {};
    const mockBody = { accountId: "account123" };
    const mockResult = {
      isSuccess: true,
      registerEntries: [
        { id: 1, isBalanceEntry: false },
        { id: 2, isBalanceEntry: true },
        { id: 3, isBalanceEntry: false },
        { id: 4, isBalanceEntry: true },
        { id: 5, isBalanceEntry: false },
      ],
      accountRegisters: [
        { id: 1, accountId: "account123" },
        { id: 2, accountId: "account123" },
      ],
      errors: null,
    };

    const { readBody } = await import("h3");
    const { recalculateSchema } = await import("~/schema/zod");
    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );
    const { prisma } = await import("~/server/clients/prismaClient");

    (readBody as any).mockResolvedValue(mockBody);
    (recalculateSchema.parse as any).mockReturnValue({
      accountId: "account123",
    });
    (ForecastEngineFactory.create as any).mockReturnValue(mockEngine);
    (mockEngine.recalculate as any).mockResolvedValue(mockResult);

    const result = await recalculatePostHandler(mockEvent);

    expect(result).toEqual({
      success: true,
      entriesCalculated: 5,
      entriesBalance: 2,
      accountRegisters: 2,
    });
  });
});
