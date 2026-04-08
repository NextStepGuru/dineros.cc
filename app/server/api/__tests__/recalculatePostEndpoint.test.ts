import { strictEqual } from "node:assert";
import { describe, it, expect, beforeEach, vi } from "vitest";

let mockPrisma!: ReturnType<
  Awaited<typeof import("~/tests/helpers/prismaMock")>["createMockPrisma"]
>;

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
(globalThis as any).readBody = vi.fn();

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
    withRunContext: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) =>
      fn(),
    ),
    parseInput: vi.fn((s: string) => s),
    toDate: vi.fn((d: unknown) =>
      d instanceof Date ? d : new Date(String(d)),
    ),
    now: vi.fn(() => ({
      startOf: vi.fn(() => ({
        toDate: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
      })),
      add: vi.fn(() => ({
        toDate: vi.fn(() => new Date("2026-01-01T00:00:00.000Z")),
      })),
    })),
  },
}));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  mockPrisma = createMockPrisma();
  return { prisma: mockPrisma };
});

const authCtx = { userId: 123, jwtKey: "k", iat: 1, exp: 999 };
function mockEventWithAuth() {
  return { context: { user: authCtx } };
}

describe("Recalculate POST API Endpoint", () => {
  let recalculatePostHandler: any;
  let mockEngine: any;

  beforeEach(async () => {
    // Mock engine
    mockEngine = {
      recalculate: vi.fn(),
    };

    // Properly set up the global mock function
    (globalThis as any).readBody = vi.fn();

    const module = await import("../recalculate.post");
    recalculatePostHandler = module.default;
    mockPrisma.userAccount.findFirstOrThrow.mockResolvedValue({
      userId: 123,
      accountId: "account123",
    });
  });

  it("should successfully recalculate account balances", async () => {
    const mockEvent = mockEventWithAuth();
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

    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );

    (globalThis as any).readBody.mockResolvedValue(mockBody);
    ForecastEngineFactory.create.mockReturnValue(mockEngine);
    mockEngine.recalculate.mockResolvedValue(mockResult);

    const result = await recalculatePostHandler(mockEvent);

    strictEqual(
      ForecastEngineFactory.create.mock.calls[0][0],
      mockPrisma,
    );
    expect(mockEngine.recalculate).toHaveBeenCalledWith({
      accountId: "account123",
      startDate: expect.any(Date),
      endDate: expect.any(Date),
      logging: { enabled: false },
    });
    expect(result).toEqual({
      success: true,
      entriesCalculated: 3,
      entriesBalance: 1,
      accountRegisters: 2,
    });
  });

  it("rejects when user is not a member of the account", async () => {
    const mockEvent = mockEventWithAuth();
    (globalThis as any).readBody.mockResolvedValue({ accountId: "other-account" });
    mockPrisma.userAccount.findFirstOrThrow.mockRejectedValue(
      new Error("Not found"),
    );

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow("Not found");
  });

  it("should handle missing account ID", async () => {
    const mockEvent = mockEventWithAuth();
    const mockBody = {};

    (globalThis as any).readBody.mockResolvedValue(mockBody);

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "Account ID is required"
    );
  });

  it("should handle empty account ID", async () => {
    const mockEvent = mockEventWithAuth();
    const mockBody = { accountId: "" };

    (globalThis as any).readBody.mockResolvedValue(mockBody);

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "Account ID is required"
    );
  });

  it("should handle forecast calculation failure", async () => {
    const mockEvent = mockEventWithAuth();
    const mockBody = { accountId: "account123" };
    const mockResult = {
      isSuccess: false,
      registerEntries: [],
      accountRegisters: [],
      errors: ["Database connection failed", "Invalid account data"],
    };

    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );

    (globalThis as any).readBody.mockResolvedValue(mockBody);
    ForecastEngineFactory.create.mockReturnValue(mockEngine);
    mockEngine.recalculate.mockResolvedValue(mockResult);

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "Forecast calculation failed"
    );
  });

  it("should handle engine recalculation errors", async () => {
    const mockEvent = mockEventWithAuth();
    const mockBody = { accountId: "account123" };

    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );

    (globalThis as any).readBody.mockResolvedValue(mockBody);
    ForecastEngineFactory.create.mockReturnValue(mockEngine);
    mockEngine.recalculate.mockRejectedValue(
      new Error("Engine recalculation failed")
    );

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow(
      "Engine recalculation failed"
    );
  });

  it("should handle schema validation errors", async () => {
    const mockEvent = mockEventWithAuth();
    (globalThis as any).readBody.mockResolvedValue(123);

    await expect(recalculatePostHandler(mockEvent)).rejects.toThrow();
  });

  it("should use correct date range for recalculation", async () => {
    const mockEvent = mockEventWithAuth();
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

    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );

    (globalThis as any).readBody.mockResolvedValue(mockBody);
    ForecastEngineFactory.create.mockReturnValue(mockEngine);
    mockEngine.recalculate.mockResolvedValue(mockResult);

    const result = await recalculatePostHandler(mockEvent);

    expect(mockEngine.recalculate).toHaveBeenCalledWith({
      accountId: "account123",
      startDate: expect.any(Date),
      endDate: expect.any(Date),
      logging: { enabled: false },
    });
    expect(result).toEqual({
      success: true,
      entriesCalculated: 2,
      entriesBalance: 1,
      accountRegisters: 1,
    });
  });

  it("should return correct statistics for successful recalculation", async () => {
    const mockEvent = mockEventWithAuth();
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

    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );

    (globalThis as any).readBody.mockResolvedValue(mockBody);
    ForecastEngineFactory.create.mockReturnValue(mockEngine);
    mockEngine.recalculate.mockResolvedValue(mockResult);

    const result = await recalculatePostHandler(mockEvent);

    expect(result).toEqual({
      success: true,
      entriesCalculated: 5,
      entriesBalance: 2,
      accountRegisters: 2,
    });
  });

  it("should run recalculate inside withRunContext when fixedNow is set", async () => {
    const mockEvent = mockEventWithAuth();
    const mockBody = {
      accountId: "account123",
      fixedNow: "2024-06-15T12:00:00.000Z",
      timezone: "America/New_York",
    };
    const mockResult = {
      isSuccess: true,
      registerEntries: [{ id: 1, isBalanceEntry: false }],
      accountRegisters: [{ id: 1, accountId: "account123" }],
      errors: null,
    };

    const { ForecastEngineFactory } = await import(
      "~/server/services/forecast"
    );
    const { dateTimeService } = await import("~/server/services/forecast");

    (globalThis as any).readBody.mockResolvedValue(mockBody);
    ForecastEngineFactory.create.mockReturnValue(mockEngine);
    mockEngine.recalculate.mockResolvedValue(mockResult);

    const result = await recalculatePostHandler(mockEvent);

    expect(dateTimeService.withRunContext).toHaveBeenCalledWith(
      {
        fixedNow: "2024-06-15T12:00:00.000Z",
        timezone: "America/New_York",
      },
      expect.any(Function),
    );
    expect(result.success).toBe(true);
  });
});
