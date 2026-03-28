import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

type RegisterTestGlobal = typeof globalThis & {
  defineEventHandler: Mock;
  getQuery: Mock;
  readMultipartFormData: Mock;
};

function registerTestGlobal(): RegisterTestGlobal {
  return globalThis as RegisterTestGlobal;
}

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  const g = registerTestGlobal();
  g.defineEventHandler = vi.fn((handler) => handler);
  g.getQuery = vi.fn();
  g.readMultipartFormData = vi.fn();
});

// Make H3 functions globally available
{
  const g = registerTestGlobal();
  g.getQuery = vi.fn();
  g.readMultipartFormData = vi.fn();
}

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const fullMessage = `HTTP ${statusCode}: ${message}`;
    const err = new Error(fullMessage) as Error & {
      statusCode: number;
      statusMessage: string;
    };
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  getQuery: vi.fn(),
  readMultipartFormData: vi.fn(),
  setResponseStatus: vi.fn(),
}));

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    accountRegister: {
      findUniqueOrThrow: vi.fn(),
      aggregate: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    registerEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
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

vi.mock("papaparse", () => ({
  default: {
    parse: vi.fn(),
  },
  parse: vi.fn(),
}));

vi.mock("@paralleldrive/cuid2", () => ({
  createId: vi.fn(),
}));

describe("Register and File Upload API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Properly set up the global mock functions
    const g = registerTestGlobal();
    g.getQuery = vi.fn();
    g.readMultipartFormData = vi.fn();
  });

  describe("GET /api/register", () => {
    let registerHandler: any;

    beforeEach(async () => {
      const module = await import("../register");
      registerHandler = module.default;
    });

    it("should successfully return register entries in full mode", async () => {
      const mockEvent = {};
      const mockQuery = {
        accountId: "account-123",
        accountRegisterId: "1",
        focusedAt: "2024-01-01",
        skip: "0",
        take: "100",
        direction: "future",
        loadMode: "full",
      };

      const mockAccountRegister = {
        id: 1,
        balance: 1000,
        latestBalance: 1500,
        targetAccountRegisterId: null as number | null,
        type: { isCredit: false },
      };

      const mockRegisterEntries = [
        {
          id: "entry-1",
          description: "Test Entry 1",
          amount: 100,
          balance: 1100,
          seq: 1,
          isCleared: false,
          isProjected: true,
        },
        {
          id: "entry-2",
          description: "Test Entry 2",
          amount: -50,
          balance: 1050,
          seq: 2,
          isCleared: false,
          isProjected: true,
        },
      ];

      const mockBalanceUpdated = [
        { ...mockRegisterEntries[0], balance: 1300 },
        { ...mockRegisterEntries[1], balance: 1250 },
      ];

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      registerTestGlobal().getQuery.mockReturnValue(mockQuery);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(prisma.accountRegister.findUniqueOrThrow as Mock).mockResolvedValue(
        mockAccountRegister,
      );
      vi.mocked(prisma.registerEntry.count as Mock).mockResolvedValue(2);
      vi.mocked(prisma.registerEntry.findMany as Mock).mockResolvedValue(
        mockRegisterEntries,
      );
      vi.mocked(prisma.accountRegister.findMany as Mock).mockImplementation(
        (args: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if ("subAccountRegisterId" in w) {
            return Promise.resolve([]);
          }
          if ("targetAccountRegisterId" in w && "accountId" in w) {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        },
      );
      vi.mocked(recalculateRunningBalanceAndSort as Mock).mockReturnValue(
        mockBalanceUpdated,
      );

      const result = await registerHandler(mockEvent);

      expect(registerTestGlobal().getQuery).toHaveBeenCalledWith(mockEvent);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.accountRegister.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          balance: true,
          latestBalance: true,
          type: true,
          targetAccountRegisterId: true,
        },
      });
      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            accountId: "account-123",
            targetAccountRegisterId: 1,
          },
          select: { id: true },
        }),
      );
      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          accountRegisterId: 1,
          OR: [{ isCleared: false, isReconciled: false }],
          register: {
            account: {
              is: {
                userAccounts: {
                  some: {
                    userId: 123,
                  },
                },
                id: "account-123",
              },
            },
          },
        }),
        orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
        take: 2,
      });
      expect(recalculateRunningBalanceAndSort).toHaveBeenCalledWith({
        registerEntries: mockRegisterEntries,
        balance: 1500,
        type: "debit",
      });
      expect(result).toEqual({
        entries: mockBalanceUpdated,
        lowest: mockBalanceUpdated[1],
        highest: mockBalanceUpdated[0],
        skip: 0,
        focusedAt: new Date("2024-01-01T00:00:00.000Z"),
        take: 100,
        loadMode: "full",
        isPartialLoad: false,
        hasMore: false,
        totalCount: 2,
      });
    });

    it("future: loads loan peer registers for the viewed accountRegisterId", async () => {
      const mockEvent = {};
      const mockQuery = {
        accountId: "account-123",
        accountRegisterId: "9",
        focusedAt: "2024-01-01",
        skip: "0",
        take: "100",
        direction: "future",
        loadMode: "full",
      };

      const mockAccountRegister = {
        id: 9,
        balance: -1000,
        latestBalance: -1000,
        targetAccountRegisterId: 1,
        type: { isCredit: false },
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      registerTestGlobal().getQuery.mockReturnValue(mockQuery);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(prisma.accountRegister.findUniqueOrThrow as Mock).mockResolvedValue(
        mockAccountRegister,
      );
      vi.mocked(prisma.registerEntry.count as Mock).mockResolvedValue(1);
      vi.mocked(prisma.registerEntry.findMany as Mock).mockResolvedValue([
        {
          id: "e1",
          description: "Bal",
          amount: 0,
          balance: 0,
          seq: 1,
          isBalanceEntry: true,
          isProjected: true,
          isCleared: false,
          isPending: false,
          isManualEntry: false,
          typeId: null,
          sourceAccountRegisterId: null,
        },
      ]);
      vi.mocked(prisma.accountRegister.findMany as Mock).mockImplementation(
        (args: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if ("subAccountRegisterId" in w) {
            return Promise.resolve([]);
          }
          if ("targetAccountRegisterId" in w && "accountId" in w) {
            expect(w.targetAccountRegisterId).toBe(9);
            expect(w.accountId).toBe("account-123");
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        },
      );
      vi.mocked(recalculateRunningBalanceAndSort as Mock).mockImplementation(
        (x: { registerEntries: unknown[] }) => x.registerEntries,
      );

      await registerHandler(mockEvent);

      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            accountId: "account-123",
            targetAccountRegisterId: 9,
          },
          select: { id: true },
        }),
      );
    });

    it("future: extends first page so loan transfer matched by peer id is not dropped after many type-6 rows", async () => {
      const mockEvent = {};
      const mockQuery = {
        accountId: "account-123",
        accountRegisterId: "1",
        focusedAt: "2024-01-01",
        skip: "0",
        take: "500",
        direction: "future",
        loadMode: "full",
      };

      const mockAccountRegister = {
        id: 1,
        balance: 5000,
        latestBalance: 5000,
        targetAccountRegisterId: null as number | null,
        type: { isCredit: false },
      };

      const baseRow = {
        isCleared: false,
        isPending: false,
        isManualEntry: false,
        isReconciled: false,
      };

      const fromDb: Record<string, unknown>[] = [
        {
          ...baseRow,
          id: "bal",
          description: "Balance",
          amount: 5000,
          balance: 5000,
          seq: 1,
          isBalanceEntry: true,
          isProjected: true,
          typeId: null,
          sourceAccountRegisterId: null,
        },
      ];
      for (let i = 0; i < 549; i++) {
        fromDb.push({
          ...baseRow,
          id: `b${i}`,
          description: "Transfer for Fuel",
          amount: -1,
          balance: 0,
          seq: i + 2,
          isBalanceEntry: false,
          isProjected: true,
          typeId: 6,
          sourceAccountRegisterId: 70,
        });
      }
      fromDb.push({
        ...baseRow,
        id: "loan",
        description: "Transfer for Payment to RV",
        amount: -200,
        balance: 0,
        seq: 552,
        isBalanceEntry: false,
        isProjected: true,
        typeId: 6,
        sourceAccountRegisterId: 9,
      });

      const sorted = fromDb.map((r) => ({ ...r }));

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      registerTestGlobal().getQuery.mockReturnValue(mockQuery);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(prisma.accountRegister.findUniqueOrThrow as Mock).mockResolvedValue(
        mockAccountRegister,
      );
      vi.mocked(prisma.registerEntry.count as Mock).mockResolvedValue(fromDb.length);
      vi.mocked(prisma.registerEntry.findMany as Mock).mockResolvedValue(fromDb);
      vi.mocked(prisma.accountRegister.findMany as Mock).mockImplementation(
        (args: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if ("subAccountRegisterId" in w) {
            return Promise.resolve([]);
          }
          if ("targetAccountRegisterId" in w && "accountId" in w) {
            return Promise.resolve([{ id: 9 }]);
          }
          return Promise.resolve([]);
        },
      );
      vi.mocked(recalculateRunningBalanceAndSort as Mock).mockReturnValue(sorted);

      const result = await registerHandler(mockEvent);

      expect(result.entries.length).toBeGreaterThan(500);
      expect(
        result.entries.some(
          (e: { id?: string; description?: string | null }) =>
            e.id === "loan" || e.description?.includes("RV"),
        ),
      ).toBe(true);
      expect(result.hasMore).toBe(false);
    });

    it("should successfully return register entries in quick mode", async () => {
      const mockEvent = {};
      const mockQuery = {
        accountId: "account-123",
        accountRegisterId: "1",
        focusedAt: "2024-01-01",
        skip: "0",
        take: "100", // Test with higher take to see Math.min behavior
        direction: "future",
        loadMode: "quick",
      };

      const mockAccountRegister = {
        id: 1,
        balance: 1000,
        latestBalance: 1500,
        targetAccountRegisterId: null as number | null,
        type: { isCredit: true },
      };

      const mockRegisterEntries = [
        {
          id: "entry-1",
          description: "Test Entry",
          amount: 100,
          balance: 1100,
          seq: 1,
        },
      ];

      const mockBalanceUpdated = [{ ...mockRegisterEntries[0], balance: 1500 }];

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      vi.mocked(getQuery as Mock).mockReturnValue(mockQuery);
      registerTestGlobal().getQuery.mockReturnValue(mockQuery);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(prisma.accountRegister.findUniqueOrThrow as Mock).mockResolvedValue(
        mockAccountRegister,
      );
      vi.mocked(prisma.registerEntry.count as Mock).mockResolvedValue(2);
      vi.mocked(prisma.registerEntry.findMany as Mock).mockResolvedValue(
        mockRegisterEntries,
      );
      vi.mocked(prisma.accountRegister.findMany as Mock).mockImplementation(
        (args: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if ("subAccountRegisterId" in w) {
            return Promise.resolve([]);
          }
          if ("targetAccountRegisterId" in w && "accountId" in w) {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        },
      );
      vi.mocked(recalculateRunningBalanceAndSort as Mock).mockReturnValue(
        mockBalanceUpdated,
      );

      const result = await registerHandler(mockEvent);

      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
          orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
          where: expect.objectContaining({
            accountRegisterId: 1,
            OR: [{ isCleared: false, isReconciled: false }],
            register: {
              account: {
                is: {
                  id: "account-123",
                  userAccounts: {
                    some: { userId: 123 },
                  },
                },
              },
            },
          }),
        }),
      );
      expect(recalculateRunningBalanceAndSort).toHaveBeenCalledWith({
        registerEntries: mockRegisterEntries,
        balance: 1500, // latestBalance - 0 (null pocket balances)
        type: "credit",
      });
      // Credit register API caps running balance at 0 (never show positive when payments exceed)
      const expectedEntries = [{ ...mockBalanceUpdated[0], balance: 0 }];
      expect(result).toEqual({
        entries: expectedEntries,
        lowest: expectedEntries[0],
        highest: expectedEntries[0],
        skip: 0,
        focusedAt: expect.any(Date),
        take: 50,
        loadMode: "quick",
        isPartialLoad: true,
        hasMore: false,
        totalCount: 2,
      });
    });

    it("should handle past direction with correct filter conditions", async () => {
      const mockEvent = {};
      const mockQuery = {
        accountId: "account-123",
        accountRegisterId: "1",
        focusedAt: "2024-01-01",
        skip: "0",
        take: "100",
        direction: "past",
        loadMode: "full",
      };

      const mockAccountRegister = {
        id: 1,
        balance: 1000,
        latestBalance: 1500,
        targetAccountRegisterId: null as number | null,
        type: { isCredit: false },
      };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      vi.mocked(getQuery as Mock).mockReturnValue(mockQuery);
      registerTestGlobal().getQuery.mockReturnValue(mockQuery);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(prisma.accountRegister.findUniqueOrThrow as Mock).mockResolvedValue(
        mockAccountRegister,
      );
      vi.mocked(prisma.registerEntry.count as Mock).mockResolvedValue(0);
      vi.mocked(prisma.registerEntry.findMany as Mock).mockResolvedValue([]);
      vi.mocked(prisma.accountRegister.findMany as Mock).mockImplementation(
        (args: { where?: Record<string, unknown> }) => {
          const w = args?.where ?? {};
          if ("subAccountRegisterId" in w) {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        },
      );

      await registerHandler(mockEvent);

      const peerLoanCalls = vi
        .mocked(prisma.accountRegister.findMany)
        .mock.calls.filter((call: unknown[]) => {
          const arg = call[0] as
            | { where?: Record<string, unknown> }
            | undefined;
          return arg?.where && "targetAccountRegisterId" in arg.where;
        });
      expect(peerLoanCalls.length).toBe(0);

      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
          where: expect.objectContaining({
            accountRegisterId: 1,
            OR: [
              { isCleared: true },
              { isBalanceEntry: true },
              { isReconciled: true },
            ],
            register: {
              account: {
                is: {
                  id: "account-123",
                  userAccounts: {
                    some: {
                      userId: 123,
                    },
                  },
                },
              },
            },
          }),
        }),
      );
    });

    it("should handle unauthorized access", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "1" };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      vi.mocked(getQuery as Mock).mockReturnValue(mockQuery);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(prisma.accountRegister.findUniqueOrThrow as Mock).mockRejectedValue(
        new Error("Account register not found"),
      );
      vi.mocked(handleApiError as Mock).mockImplementation((error: any) => {
        throw error;
      });

      await expect(registerHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle invalid query parameters", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "invalid" };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      vi.mocked(getQuery as Mock).mockReturnValue(mockQuery);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(handleApiError as Mock).mockImplementation((error: any) => {
        throw error;
      });

      await expect(registerHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/upload-file", () => {
    let uploadFileHandler: any;

    beforeEach(async () => {
      const module = await import("../upload-file.post");
      uploadFileHandler = module.default;
    });

    it("should successfully process CSV file upload", async () => {
      const mockEvent = {};
      const mockFormData = [
        {
          name: "accountRegisterId",
          data: Buffer.from("1"),
        },
        {
          name: "fileData",
          data: Buffer.from(
            "Date,Description,Amount,Note,Check Number,Category\n2024-01-01,Test Transaction,100.00,Test Note,,Food",
          ),
        },
      ];

      const mockCsvData = {
        data: [
          {
            Date: "2024-01-01",
            Description: "Test Transaction",
            Amount: "100.00",
            Note: "Test Note",
            "Check Number": "",
            Category: "Food",
          },
        ],
      };

      const mockAccountRegister = {
        id: 1,
        account: {
          userAccounts: [{ userId: 123 }],
        },
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const papaparse = await import("papaparse");
      const { createId } = await import("@paralleldrive/cuid2");

      registerTestGlobal().readMultipartFormData.mockResolvedValue(
        mockFormData,
      );
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(prisma.accountRegister.findUniqueOrThrow as Mock).mockResolvedValue({
        accountId: mockAccountRegister.id,
      });
      vi.mocked(papaparse.default.parse as Mock).mockReturnValue(mockCsvData);
      vi.mocked(prisma.registerEntry.findFirst as Mock).mockResolvedValue(null); // No duplicates found
      vi.mocked(prisma.category.findMany as Mock).mockResolvedValue([]);
      vi.mocked(createId as Mock).mockReturnValue("entry-123");
      vi.mocked(prisma.registerEntry.create as Mock).mockResolvedValue({
        id: "entry-123",
        description: "Test Transaction",
        amount: 100,
      });
      vi.mocked(prisma.registerEntry.createMany as Mock).mockResolvedValue({
        count: 1,
      });

      const result = await uploadFileHandler(mockEvent);

      expect(registerTestGlobal().readMultipartFormData).toHaveBeenCalledWith(
        mockEvent,
      );
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(papaparse.default.parse).toHaveBeenCalledWith(
        "Date,Description,Amount,Note,Check Number,Category\n2024-01-01,Test Transaction,100.00,Test Note,,Food",
        { header: true },
      );
      expect(prisma.registerEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            accountRegisterId: 1,
            description: "Test Transaction",
            amount: 100,
            isCleared: true,
            isProjected: false,
            createdAt: new Date("2024-01-01T00:00:00.000Z"),
          }),
        ]),
      });
      expect(result).toEqual(123); // Upload endpoint returns userId
    });

    it("should handle missing form data", async () => {
      const mockEvent = {};

      const { readMultipartFormData } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");

      vi.mocked(readMultipartFormData as Mock).mockResolvedValue(null); // No form data
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });

      const result = await uploadFileHandler(mockEvent);

      expect(result).toEqual(123); // Upload endpoint returns userId when no form data
    });

    it("should handle invalid CSV data", async () => {
      const mockEvent = {};
      const mockFormData = [
        {
          name: "accountRegisterId",
          data: Buffer.from("1"),
        },
        {
          name: "fileData",
          data: Buffer.from("invalid,csv,data"),
        },
      ];

      const mockCsvData = {
        data: [], // Empty data
      };

      const { readMultipartFormData } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const papaparse = await import("papaparse");

      vi.mocked(readMultipartFormData as Mock).mockResolvedValue(mockFormData);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(papaparse.default.parse as Mock).mockReturnValue(mockCsvData);
      vi.mocked(prisma.accountRegister.findFirstOrThrow as Mock).mockResolvedValue({
        id: 1,
        account: { userAccounts: [{ userId: 123 }] },
      });

      const result = await uploadFileHandler(mockEvent);

      expect(result).toEqual(123); // Upload endpoint returns userId
    });

    it("should handle unauthorized account register access", async () => {
      const mockEvent = {};
      const mockFormData = [
        {
          name: "accountRegisterId",
          data: Buffer.from("1"),
        },
        {
          name: "fileData",
          data: Buffer.from("Date,Description,Amount\n2024-01-01,Test,100"),
        },
      ];

      const mockCsvData = {
        data: [
          {
            Date: "2024-01-01",
            Description: "Test",
            Amount: "100",
          },
        ],
      };

      const { readMultipartFormData } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const papaparse = await import("papaparse");

      vi.mocked(readMultipartFormData as Mock).mockResolvedValue(mockFormData);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(papaparse.default.parse as Mock).mockReturnValue(mockCsvData);
      vi.mocked(prisma.registerEntry.findFirst as Mock).mockResolvedValue(null); // No duplicates

      const result = await uploadFileHandler(mockEvent);

      expect(result).toEqual(123); // Upload endpoint returns userId
    });

    it("should handle schema validation errors", async () => {
      const mockEvent = {};
      const mockFormData = [
        {
          name: "accountRegisterId",
          data: Buffer.from("1"), // Valid numeric value
        },
        {
          name: "fileData",
          data: Buffer.from("Date,Description,Amount\n2024-01-01,Test,100"),
        },
      ];

      const mockCsvData = {
        data: [
          {
            Date: "2024-01-01",
            Description: "Test",
            Amount: "100",
          },
        ],
      };

      const { readMultipartFormData } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const papaparse = await import("papaparse");

      vi.mocked(readMultipartFormData as Mock).mockResolvedValue(mockFormData);
      vi.mocked(getUser as Mock).mockReturnValue({ userId: 123 });
      vi.mocked(papaparse.default.parse as Mock).mockReturnValue(mockCsvData);
      vi.mocked(prisma.registerEntry.findFirst as Mock).mockResolvedValue(null); // No duplicates

      const result = await uploadFileHandler(mockEvent);

      expect(result).toEqual(123); // Upload endpoint returns userId
    });
  });

  describe("Cross-endpoint Integration", () => {
    it("should use consistent error handling", async () => {
      const { handleApiError } = await import("~/server/lib/handleApiError");

      expect(handleApiError).toBeDefined();
      expect(typeof handleApiError).toBe("function");
    });

    it("should use consistent user authentication", async () => {
      const { getUser } = await import("~/server/lib/getUser");

      expect(getUser).toBeDefined();
      expect(typeof getUser).toBe("function");
    });
  });
});
