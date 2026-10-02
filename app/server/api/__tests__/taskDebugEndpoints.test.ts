import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

const { mockEngineCreate, googleMocks } = vi.hoisted(() => ({
  mockEngineCreate: vi.fn(),
  googleMocks: {
    OAuth2: vi.fn(),
    sheets: vi.fn(),
    lastAuth: null as any,
  },
}));

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  createError: vi.fn((error: any) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const err = new Error(`HTTP ${statusCode}: ${message}`) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  readBody: vi.fn(),
  getQuery: vi.fn(),
  setResponseStatus: vi.fn(),
  getRouterParam: vi.fn(),
  setHeader: vi.fn(),
  getHeader: vi.fn(),
}));

// Make H3 functions globally available (handlers rely on Nitro auto-imports)
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();
(globalThis as any).createError = vi.fn((error: any) => {
  const statusCode = error.statusCode || 500;
  const message = error.statusMessage || error.message || "Unknown error";
  const err = new Error(`HTTP ${statusCode}: ${message}`) as any;
  err.statusCode = statusCode;
  err.statusMessage = message;
  throw err;
});

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/services/forecast", () => ({
  ForecastEngineFactory: {
    create: mockEngineCreate,
  },
  dateTimeService: {
    now: vi.fn(() => ({
      startOf: vi.fn(() => ({
        toDate: () => new Date("2024-01-01T00:00:00.000Z"),
      })),
      add: vi.fn(() => ({
        toDate: () => new Date("2026-01-01T00:00:00.000Z"),
      })),
      toDate: () => new Date("2024-01-01T00:00:00.000Z"),
    })),
    nowDate: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
    formatInTimezone: vi.fn(() => "2024-01-05"),
  },
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/lib/sort", () => ({
  recalculateRunningBalanceAndSort: vi.fn(),
}));

vi.mock("~/server/lib/registerLedgerFuture", () => ({
  futureRegisterEntryOr: [{ isCleared: false, isReconciled: false }],
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: googleMocks.OAuth2 },
    sheets: googleMocks.sheets,
  },
}));

function makeSheetBody(overrides: Record<string, unknown> = {}) {
  return {
    accountRegisterId: 62,
    spreadsheetId: "sheet-123",
    sheetName: "Register Data",
    googleCredentials: {
      client_id: "client-id",
      client_secret: "client-secret",
      redirect_uris: ["https://localhost/callback"],
    },
    googleToken: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      scope: "https://www.googleapis.com/auth/spreadsheets",
      token_type: "Bearer",
    },
    ...overrides,
  };
}

function makeSheetEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    accountRegisterId: 62,
    description: "Groceries",
    amount: -25.5,
    balance: 900,
    createdAt: new Date("2024-01-05T00:00:00.000Z"),
    isBalanceEntry: false,
    isCleared: true,
    isReconciled: false,
    isProjected: false,
    isPending: false,
    sourceAccountRegisterId: null,
    reoccurrenceId: null,
    ...overrides,
  };
}

describe("Task Debug/Test API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).getQuery = vi.fn();
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).createError = vi.fn((error: any) => {
      const statusCode = error.statusCode || 500;
      const message = error.statusMessage || error.message || "Unknown error";
      const err = new Error(`HTTP ${statusCode}: ${message}`) as any;
      err.statusCode = statusCode;
      err.statusMessage = message;
      throw err;
    });
    googleMocks.lastAuth = null;
    // A function (not arrow) implementation is required: the handler
    // constructs the client with `new google.auth.OAuth2(...)`.
    googleMocks.OAuth2.mockImplementation(function () {
      const instance: any = { setCredentials: vi.fn() };
      googleMocks.lastAuth = instance;
      return instance;
    });
  });

  describe("GET /api/tasks/debug-balance-entry", () => {
    it("runs a forecast and reports balance entries from the cache", async () => {
      const module = await import("../tasks/debug-balance-entry");
      const handler = module.default;

      const beforeEntries = [
        { id: 1, isBalanceEntry: true, description: "Old" },
      ];
      const afterEntries = [
        {
          id: 1,
          isBalanceEntry: true,
          accountRegisterId: 62,
          description: "Old",
          amount: 1000,
          balance: 1000,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
        {
          id: 2,
          isBalanceEntry: true,
          accountRegisterId: 62,
          description: "New",
          amount: 500,
          balance: 1500,
          createdAt: new Date("2024-01-02T00:00:00.000Z"),
        },
        {
          id: 3,
          isBalanceEntry: false,
          accountRegisterId: 62,
          description: "Regular",
          amount: -25,
          balance: 1475,
          createdAt: new Date("2024-01-03T00:00:00.000Z"),
        },
      ];
      const accountRegister = { id: 62, name: "Checking" };
      const recalculate = vi.fn().mockResolvedValue(undefined);
      mockEngineCreate.mockReturnValue({
        recalculate,
        getCache: vi
          .fn()
          .mockReturnValueOnce({
            registerEntry: { find: vi.fn(() => beforeEntries) },
          })
          .mockReturnValue({
            registerEntry: { find: vi.fn(() => afterEntries) },
            accountRegister: { findOne: vi.fn(() => accountRegister) },
          }),
      });
      (globalThis as any).getQuery.mockReturnValue({
        accountId: "account-1",
        accountRegisterId: "62",
      });

      const result = await handler({});

      expect(mockEngineCreate).toHaveBeenCalled();
      expect(recalculate).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "account-1" }),
      );
      expect(result).toEqual({
        accountId: "account-1",
        accountRegisterId: 62,
        accountRegister,
        balanceEntriesBefore: 1,
        balanceEntriesAfter: 2,
        specificBalanceEntries: [
          {
            id: 1,
            accountRegisterId: 62,
            description: "Old",
            amount: 1000,
            balance: 1000,
            isBalanceEntry: true,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            id: 2,
            accountRegisterId: 62,
            description: "New",
            amount: 500,
            balance: 1500,
            isBalanceEntry: true,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
        allBalanceEntries: [
          expect.objectContaining({ id: 1, isBalanceEntry: true }),
          expect.objectContaining({ id: 2, isBalanceEntry: true }),
        ],
      });
    });

    it("falls back to default account/register ids when query is empty", async () => {
      const module = await import("../tasks/debug-balance-entry");
      const handler = module.default;

      const recalculate = vi.fn().mockResolvedValue(undefined);
      mockEngineCreate.mockReturnValue({
        recalculate,
        getCache: vi.fn().mockReturnValue({
          registerEntry: { find: vi.fn(() => []) },
          accountRegister: { findOne: vi.fn(() => undefined) },
        }),
      });
      (globalThis as any).getQuery.mockReturnValue({});

      const result = await handler({});

      expect(result.accountId).toBe(
        "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
      );
      expect(result.accountRegisterId).toBe(62);
      expect(recalculate).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        }),
      );
    });
  });

  describe("GET /api/tasks/forecast-cache-debug", () => {
    it("returns cache contents grouped by account register", async () => {
      const module = await import("../tasks/forecast-cache-debug");
      const handler = module.default;

      const accountRegisters = [
        { id: 62, isArchived: false },
        { id: 63, isArchived: true },
      ];
      const registerEntries = [
        { id: 1, accountRegisterId: 62, isBalanceEntry: true },
        { id: 2, accountRegisterId: 62, isBalanceEntry: false },
        { id: 3, accountRegisterId: 63, isBalanceEntry: false },
      ];
      const recalculate = vi.fn().mockResolvedValue(undefined);
      mockEngineCreate.mockReturnValue({
        recalculate,
        getCache: vi.fn().mockReturnValue({
          accountRegister: { find: vi.fn(() => accountRegisters) },
          registerEntry: { find: vi.fn(() => registerEntries) },
        }),
      });
      (globalThis as any).getQuery.mockReturnValue({ accountId: "account-9" });

      const result = await handler({});

      expect(recalculate).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "account-9" }),
      );
      expect(result).toEqual({
        allAccountRegisters: accountRegisters,
        activeAccountRegisters: [{ id: 62, isArchived: false }],
        entriesByAccount: {
          62: [registerEntries[0], registerEntries[1]],
          63: [registerEntries[2]],
        },
        allRegisterEntries: registerEntries,
        balanceEntries: [registerEntries[0]],
      });
    });

    it("omits accountId from the context when not provided", async () => {
      const module = await import("../tasks/forecast-cache-debug");
      const handler = module.default;

      const recalculate = vi.fn().mockResolvedValue(undefined);
      mockEngineCreate.mockReturnValue({
        recalculate,
        getCache: vi.fn().mockReturnValue({
          accountRegister: { find: vi.fn(() => []) },
          registerEntry: { find: vi.fn(() => []) },
        }),
      });
      (globalThis as any).getQuery.mockReturnValue({});

      await handler({});

      expect(recalculate).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: undefined }),
      );
    });
  });

  describe("GET /api/tasks/test-balance-entry", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/test-balance-entry");
      handler = module.default;
    });

    it("rejects with 400 when accountRegisterId is missing", async () => {
      (globalThis as any).getQuery.mockReturnValue({});

      const error = await handler({}).catch((e: any) => e);

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain("accountRegisterId is required");
    });

    it("rejects with 404 when the account register does not exist", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getQuery.mockReturnValue({
        accountRegisterId: "62",
      });
      (prisma.accountRegister.findUnique as any).mockResolvedValue(null);

      const error = await handler({}).catch((e: any) => e);

      expect(error.statusCode).toBe(404);
      expect(error.message).toContain("Account register not found");
    });

    it("returns the register with its latest balance entry summary", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      const accountRegister = {
        id: 62,
        name: "Checking",
        balance: 1000,
        latestBalance: 974.5,
      };
      const balanceEntry = {
        id: 9,
        accountRegisterId: 62,
        description: "Initial Balance",
        amount: 1000,
        balance: 1000,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };

      (globalThis as any).getQuery.mockReturnValue({
        accountRegisterId: "62",
      });
      (prisma.accountRegister.findUnique as any).mockResolvedValue(
        accountRegister,
      );
      (prisma.registerEntry.findFirst as any).mockResolvedValue(balanceEntry);

      const result = await handler({});

      expect(prisma.accountRegister.findUnique).toHaveBeenCalledWith({
        where: { id: 62 },
        select: { id: true, name: true, balance: true, latestBalance: true },
      });
      expect(prisma.registerEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountRegisterId: 62, isBalanceEntry: true },
          orderBy: { createdAt: "desc" },
        }),
      );
      expect(result).toEqual({
        accountRegister,
        balanceEntry,
        summary: {
          accountRegisterId: 62,
          accountName: "Checking",
          accountBalance: 1000,
          accountLatestBalance: 974.5,
          balanceEntryAmount: 1000,
          balanceEntryBalance: 1000,
          hasBalanceEntry: true,
        },
      });
    });

    it("reports hasBalanceEntry false with zeroed amounts when none exists", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getQuery.mockReturnValue({
        accountRegisterId: "62",
      });
      (prisma.accountRegister.findUnique as any).mockResolvedValue({
        id: 62,
        name: "Checking",
        balance: 0,
        latestBalance: 0,
      });
      (prisma.registerEntry.findFirst as any).mockResolvedValue(null);

      const result = await handler({});

      expect(result.balanceEntry).toBeNull();
      expect(result.summary).toEqual(
        expect.objectContaining({
          balanceEntryAmount: 0,
          balanceEntryBalance: 0,
          hasBalanceEntry: false,
        }),
      );
    });
  });

  describe("GET /api/tasks/test-forecast", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/test-forecast");
      handler = module.default;
    });

    it("returns success with cache and database balance entry counts", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      const cacheBalanceEntries = [
        {
          id: 1,
          accountRegisterId: 62,
          description: "Cached",
          isBalanceEntry: true,
        },
      ];
      const recalculate = vi.fn().mockResolvedValue({
        isSuccess: true,
        registerEntries: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
      mockEngineCreate.mockReturnValue({
        recalculate,
        getCache: vi.fn().mockReturnValue({
          registerEntry: { find: vi.fn(() => cacheBalanceEntries) },
        }),
      });
      (prisma.registerEntry.findMany as any).mockResolvedValue([
        { id: 1, accountRegisterId: 62 },
      ]);

      const result = await handler({});

      expect(recalculate).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
          logging: { enabled: false },
        }),
      );
      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith({
        where: { isBalanceEntry: true },
        select: {
          id: true,
          accountRegisterId: true,
          description: true,
          createdAt: true,
        },
      });
      expect(result).toEqual({
        success: true,
        cacheBalanceEntries: 1,
        dbBalanceEntries: 1,
        totalRegisterEntries: 3,
      });
    });

    it("returns success false when the forecast reports failure", async () => {
      mockEngineCreate.mockReturnValue({
        recalculate: vi.fn().mockResolvedValue({
          isSuccess: false,
          errors: ["entry 1 broken", "entry 2 broken"],
        }),
        getCache: vi.fn(),
      });

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: "Forecast calculation failed: entry 1 broken, entry 2 broken",
      });
    });

    it("returns success false when the forecast throws", async () => {
      mockEngineCreate.mockReturnValue({
        recalculate: vi.fn().mockRejectedValue(new Error("engine exploded")),
        getCache: vi.fn(),
      });

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: "engine exploded",
      });
    });
  });

  describe("GET /api/tasks/test-register-entries", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/test-register-entries");
      handler = module.default;
    });

    it("returns entry counts and samples for an account register", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      const entries = [
        { id: 1, isCleared: true, isReconciled: true, isBalanceEntry: false },
        { id: 2, isCleared: false, isReconciled: false, isBalanceEntry: false },
        { id: 3, isCleared: false, isReconciled: false, isBalanceEntry: true },
        { id: 4, isCleared: true, isReconciled: false, isBalanceEntry: true },
        { id: 5, isCleared: false, isReconciled: true, isBalanceEntry: false },
        { id: 6, isCleared: true, isReconciled: true, isBalanceEntry: false },
      ];

      (globalThis as any).getQuery.mockReturnValue({
        accountRegisterId: "62",
      });
      (prisma.registerEntry.findMany as any).mockResolvedValue(entries);

      const result = await handler({});

      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountRegisterId: 62 },
          orderBy: { createdAt: "asc" },
        }),
      );
      expect(result).toEqual({
        accountRegisterId: 62,
        totalEntries: 6,
        activeEntries: 3,
        clearedEntries: 3,
        balanceEntries: 2,
        clearedBalanceEntries: 1,
        futureEntries: 2,
        sampleEntries: entries.slice(0, 5),
        sampleFutureEntries: entries
          .filter((e) => e.isCleared === false && e.isReconciled === false)
          .slice(0, 5),
      });
    });

    it("defaults to account register 62 when query is empty", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getQuery.mockReturnValue({});
      (prisma.registerEntry.findMany as any).mockResolvedValue([]);

      const result = await handler({});

      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountRegisterId: 62 } }),
      );
      expect(result.accountRegisterId).toBe(62);
      expect(result.totalEntries).toBe(0);
    });

    it("wraps database errors in a 500 createError", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getQuery.mockReturnValue({
        accountRegisterId: "62",
      });
      (prisma.registerEntry.findMany as any).mockRejectedValue(
        new Error("select failed"),
      );

      const error = await handler({}).catch((e: any) => e);

      expect(error.statusCode).toBe(500);
      expect(error.message).toContain("select failed");
    });
  });

  describe("POST /api/tasks/sync-google-sheet", () => {
    let handler: any;
    const mockEvent = {};

    beforeEach(async () => {
      const module = await import("../tasks/sync-google-sheet.post");
      handler = module.default;
    });

    it("syncs register entries to Google Sheets for the authenticated user", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { readBody } = await import("h3");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      const entryLow = makeSheetEntry({ id: 1, balance: 900 });
      const entryHigh = makeSheetEntry({
        id: 2,
        description: "Deposit",
        amount: 100,
        balance: 950,
      });

      (getUser as any).mockReturnValue({ userId: 7 });
      (readBody as any).mockResolvedValue(makeSheetBody());
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue({
        id: 62,
        balance: 1000,
        latestBalance: 1000,
        type: { isCredit: false },
      });
      (prisma.registerEntry.findMany as any).mockResolvedValue([
        entryLow,
        entryHigh,
      ]);
      (prisma.accountRegister.aggregate as any).mockResolvedValue({
        _sum: { balance: 100 },
      });
      (recalculateRunningBalanceAndSort as any).mockReturnValue([
        entryLow,
        entryHigh,
      ]);
      const clear = vi.fn().mockResolvedValue({});
      const update = vi
        .fn()
        .mockResolvedValue({ data: { updatedCells: 12 } });
      googleMocks.sheets.mockReturnValue({
        spreadsheets: { values: { clear, update } },
      });

      const result = await handler(mockEvent);

      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.accountRegister.findFirstOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 62,
            account: {
              userAccounts: { some: { userId: 7 } },
            },
          },
        }),
      );
      // balance = latestBalance 1000 - pocket balances 100
      expect(recalculateRunningBalanceAndSort).toHaveBeenCalledWith({
        registerEntries: [entryLow, entryHigh],
        balance: 900,
        type: "debit",
      });
      expect(googleMocks.OAuth2).toHaveBeenCalledWith(
        "client-id",
        "client-secret",
        "https://localhost/callback",
      );
      expect(googleMocks.lastAuth.setCredentials).toHaveBeenCalledWith(
        makeSheetBody().googleToken,
      );
      expect(clear).toHaveBeenCalledWith({
        spreadsheetId: "sheet-123",
        range: "Register Data",
      });
      expect(update).toHaveBeenCalledWith({
        spreadsheetId: "sheet-123",
        range: "Register Data!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: expect.arrayContaining([
            [
              "Date",
              "Description",
              "Amount",
              "Balance",
              "Status",
              "Type",
            ],
          ]),
        },
      });
      expect(result).toEqual({
        success: true,
        message: "Successfully synced 2 entries to Google Sheets",
        updatedCells: 12,
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-123",
        data: {
          totalEntries: 2,
          lowestBalance: 900,
          highestBalance: 950,
          lastUpdated: "2024-01-01T00:00:00.000Z",
        },
      });
    });

    it("uses credit balance direction for credit registers", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { readBody } = await import("h3");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      (getUser as any).mockReturnValue({ userId: 7 });
      (readBody as any).mockResolvedValue(makeSheetBody());
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue({
        id: 62,
        balance: 0,
        latestBalance: 500,
        type: { isCredit: true },
      });
      (prisma.registerEntry.findMany as any).mockResolvedValue([]);
      (prisma.accountRegister.aggregate as any).mockResolvedValue({
        _sum: { balance: 0 },
      });
      (recalculateRunningBalanceAndSort as any).mockReturnValue([]);
      googleMocks.sheets.mockReturnValue({
        spreadsheets: {
          values: { clear: vi.fn(), update: vi.fn() },
        },
      });

      const result = await handler(mockEvent);

      expect(recalculateRunningBalanceAndSort).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 500, type: "credit" }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          message: "No entries to sync",
          updatedCells: 0,
        }),
      );
      expect(result.data).toEqual({
        totalEntries: 0,
        lowestBalance: undefined,
        highestBalance: undefined,
        lastUpdated: "2024-01-01T00:00:00.000Z",
      });
    });

    it("returns a 500-shaped failure payload when the Sheets API errors", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { readBody, setResponseStatus } = await import("h3");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      (getUser as any).mockReturnValue({ userId: 7 });
      (readBody as any).mockResolvedValue(makeSheetBody());
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue({
        id: 62,
        balance: 0,
        latestBalance: 1000,
        type: { isCredit: false },
      });
      (prisma.registerEntry.findMany as any).mockResolvedValue([makeSheetEntry()]);
      (prisma.accountRegister.aggregate as any).mockResolvedValue({
        _sum: { balance: 0 },
      });
      (recalculateRunningBalanceAndSort as any).mockReturnValue([
        makeSheetEntry(),
      ]);
      googleMocks.sheets.mockReturnValue({
        spreadsheets: {
          values: {
            clear: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockRejectedValue(new Error("quota exceeded")),
          },
        },
      });

      const result = await handler(mockEvent);

      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 500);
      expect(result).toEqual({
        success: false,
        message: "Failed to update Google Sheets",
        error: "quota exceeded",
      });
    });

    it("routes prisma failures through handleApiError and rethrows", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const dbError = new Error("register not found");
      (getUser as any).mockReturnValue({ userId: 7 });
      (readBody as any).mockResolvedValue(makeSheetBody());
      (prisma.accountRegister.findFirstOrThrow as any).mockRejectedValue(
        dbError,
      );

      await expect(handler(mockEvent)).rejects.toThrow("register not found");
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });

    it("routes invalid request bodies through handleApiError", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getUser as any).mockReturnValue({ userId: 7 });
      (readBody as any).mockResolvedValue({ accountRegisterId: 0 });

      await expect(handler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/tasks/sync-google-sheet-test", () => {
    let handler: any;
    const mockEvent = {};

    beforeEach(async () => {
      const module = await import("../tasks/sync-google-sheet-test.post");
      handler = module.default;
    });

    it("returns a 400-shaped payload when no users exist", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { readBody, setResponseStatus } = await import("h3");

      (readBody as any).mockResolvedValue(makeSheetBody());
      (prisma.user.findFirst as any).mockResolvedValue(null);

      const result = await handler(mockEvent);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        select: { id: true },
      });
      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 400);
      expect(result).toEqual({
        success: false,
        message: "No users found in database for testing",
      });
    });

    it("syncs register entries using the default Running Budget sheet at row 3", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { readBody } = await import("h3");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      const entry = makeSheetEntry({ balance: 800 });

      (readBody as any).mockResolvedValue(
        makeSheetBody({ sheetName: "Running Budget" }),
      );
      (prisma.user.findFirst as any).mockResolvedValue({ id: 1 });
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue({
        id: 62,
        balance: 0,
        latestBalance: 900,
        type: { isCredit: false },
      });
      (prisma.registerEntry.findMany as any).mockResolvedValue([entry]);
      (prisma.accountRegister.aggregate as any).mockResolvedValue({
        _sum: { balance: 100 },
      });
      (recalculateRunningBalanceAndSort as any).mockReturnValue([entry]);
      const clear = vi.fn().mockResolvedValue({});
      const update = vi.fn().mockResolvedValue({ data: { updatedCells: 7 } });
      googleMocks.sheets.mockReturnValue({
        spreadsheets: { values: { clear, update } },
      });

      const result = await handler(mockEvent);

      expect(prisma.accountRegister.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 62 },
        select: { id: true, balance: true, latestBalance: true, type: true },
      });
      expect(recalculateRunningBalanceAndSort).toHaveBeenCalledWith({
        registerEntries: [entry],
        balance: 800,
        type: "debit",
      });
      expect(clear).toHaveBeenCalledWith({
        spreadsheetId: "sheet-123",
        range: "Running Budget",
      });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ range: "Running Budget!A3" }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          updatedCells: 7,
          message: "Successfully synced 1 entries to Google Sheets",
        }),
      );
    });

    it("returns a 500-shaped failure payload when the Sheets API errors", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { readBody, setResponseStatus } = await import("h3");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      (readBody as any).mockResolvedValue(makeSheetBody());
      (prisma.user.findFirst as any).mockResolvedValue({ id: 1 });
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue({
        id: 62,
        balance: 0,
        latestBalance: 1000,
        type: { isCredit: false },
      });
      (prisma.registerEntry.findMany as any).mockResolvedValue([makeSheetEntry()]);
      (prisma.accountRegister.aggregate as any).mockResolvedValue({
        _sum: { balance: 0 },
      });
      (recalculateRunningBalanceAndSort as any).mockReturnValue([
        makeSheetEntry(),
      ]);
      googleMocks.sheets.mockReturnValue({
        spreadsheets: {
          values: {
            clear: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockRejectedValue({ message: "invalid grant" }),
          },
        },
      });

      const result = await handler(mockEvent);

      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 500);
      expect(result).toEqual({
        success: false,
        message: "Failed to update Google Sheets",
        error: "invalid grant",
      });
    });

    it("routes validation failures through handleApiError", async () => {
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue({ spreadsheetId: "" });

      await expect(handler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });
});
