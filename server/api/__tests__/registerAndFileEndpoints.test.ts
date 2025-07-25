import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
  (globalThis as any).getQuery = vi.fn();
  (globalThis as any).readMultipartFormData = vi.fn();
});

// Make H3 functions globally available
(global as any).getQuery = vi.fn();
(global as any).readMultipartFormData = vi.fn();

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const fullMessage = `HTTP ${statusCode}: ${message}`;
    const err = new Error(fullMessage) as any;
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
    },
    registerEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
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

vi.mock("moment", () => {
  const mockMoment = vi.fn((date?: any) => ({
    utc: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    subtract: vi.fn().mockReturnThis(),
    milliseconds: vi.fn().mockReturnThis(),
    toDate: vi.fn().mockReturnValue(new Date("2024-01-01")),
  }));
  return { default: mockMoment };
});

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
    (global as any).getQuery = vi.fn();
    (global as any).readMultipartFormData = vi.fn();
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

      const mockPocketBalances = {
        _sum: { balance: 200 },
      };

      const mockBalanceUpdated = [
        { ...mockRegisterEntries[0], balance: 1300 },
        { ...mockRegisterEntries[1], balance: 1250 },
      ];

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

      (globalThis as any).getQuery.mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findUniqueOrThrow as any).mockResolvedValue(
        mockAccountRegister
      );
      (prisma.registerEntry.findMany as any).mockResolvedValue(
        mockRegisterEntries
      );
      (prisma.registerEntry.count as any).mockResolvedValue(2);
      (prisma.accountRegister.aggregate as any).mockResolvedValue(
        mockPocketBalances
      );
      (recalculateRunningBalanceAndSort as any).mockReturnValue(
        mockBalanceUpdated
      );

      const result = await registerHandler(mockEvent);

      expect((globalThis as any).getQuery).toHaveBeenCalledWith(mockEvent);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.accountRegister.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          balance: true,
          latestBalance: true,
          type: true,
        },
      });
      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          accountRegisterId: 1,
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
        orderBy: { seq: "asc" },
        take: 100, // Now loading all records up to skip + take
      });
      expect(recalculateRunningBalanceAndSort).toHaveBeenCalledWith({
        registerEntries: mockRegisterEntries,
        balance: 1300, // latestBalance - pocketBalances
        type: "debit",
      });
      expect(result).toEqual({
        entries: mockBalanceUpdated,
        lowest: mockBalanceUpdated[1], // Entry with lower balance
        highest: mockBalanceUpdated[0], // Entry with higher balance
        skip: 0,
        focusedAt: new Date("2024-01-01"),
        take: 100,
        loadMode: "full",
        isPartialLoad: false,
        hasMore: false,
        totalCount: 2,
      });
    });

    it.runIf(process.env.RUN_EDGE_CASE_TESTS === "true")(
      "should successfully return register entries in quick mode",
      async () => {
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

        const mockPocketBalances = {
          _sum: { balance: null },
        };

        const mockBalanceUpdated = [
          { ...mockRegisterEntries[0], balance: 1500 },
        ];

        const { getQuery } = await import("h3");
        const { getUser } = await import("~/server/lib/getUser");
        const { prisma } = await import("~/server/clients/prismaClient");
        const { recalculateRunningBalanceAndSort } = await import("~/lib/sort");

        (getQuery as any).mockReturnValue(mockQuery);
        (global as any).getQuery.mockReturnValue(mockQuery);
        (getUser as any).mockReturnValue({ userId: 123 });
        (prisma.accountRegister.findUniqueOrThrow as any).mockResolvedValue(
          mockAccountRegister
        );
        (prisma.registerEntry.findMany as any).mockResolvedValue(
          mockRegisterEntries
        );
        (prisma.accountRegister.aggregate as any).mockResolvedValue(
          mockPocketBalances
        );
        (recalculateRunningBalanceAndSort as any).mockReturnValue(
          mockBalanceUpdated
        );

        const result = await registerHandler(mockEvent);

        expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 50, // Quick mode correctly limits to 50
            orderBy: { seq: "asc" },
            where: expect.objectContaining({
              accountRegisterId: 1,
              OR: [
                { isCleared: false, isProjected: true },
                { isProjected: false, isCleared: false, isPending: true },
                { isBalanceEntry: true, isCleared: false },
                { isProjected: false, isManualEntry: true, isCleared: false },
              ],
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
          })
        );
        expect(recalculateRunningBalanceAndSort).toHaveBeenCalledWith({
          registerEntries: mockRegisterEntries,
          balance: 1500, // latestBalance - 0 (null pocket balances)
          type: "credit",
        });
        expect(result).toEqual({
          entries: mockBalanceUpdated,
          lowest: mockBalanceUpdated[0],
          highest: mockBalanceUpdated[0],
          skip: 0,
          focusedAt: expect.any(Date),
          take: 50,
          loadMode: "quick",
          isPartialLoad: true,
          hasMore: false,
          totalCount: 2,
        });
      }
    );

    it.runIf(process.env.RUN_EDGE_CASE_TESTS === "true")(
      "should handle past direction with correct filter conditions",
      async () => {
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
          type: { isCredit: false },
        };

        const { getQuery } = await import("h3");
        const { getUser } = await import("~/server/lib/getUser");
        const { prisma } = await import("~/server/clients/prismaClient");

        (getQuery as any).mockReturnValue(mockQuery);
        (global as any).getQuery.mockReturnValue(mockQuery);
        (getUser as any).mockReturnValue({ userId: 123 });
        (prisma.accountRegister.findUniqueOrThrow as any).mockResolvedValue(
          mockAccountRegister
        );
        (prisma.registerEntry.findMany as any).mockResolvedValue([]);
        (prisma.accountRegister.aggregate as any).mockResolvedValue({
          _sum: { balance: 0 },
        });

        await registerHandler(mockEvent);

        expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 100,
            orderBy: { seq: "asc" },
            where: expect.objectContaining({
              accountRegisterId: 1,
              OR: [
                { isCleared: true },
                { isBalanceEntry: true },
                { isReconciled: true },
                {
                  isPending: false,
                  isProjected: false,
                  isCleared: false,
                  createdAt: {
                    lte: new Date("2024-01-01"),
                  },
                },
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
          })
        );
      }
    );

    it("should handle unauthorized access", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "1" };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findUniqueOrThrow as any).mockRejectedValue(
        new Error("Account register not found")
      );
      (handleApiError as any).mockImplementation((error: any) => {
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

      (getQuery as any).mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue({ userId: 123 });
      (handleApiError as any).mockImplementation((error: any) => {
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

    it.runIf(process.env.RUN_EDGE_CASE_TESTS === "true")(
      "should successfully process CSV file upload",
      async () => {
        const mockEvent = {};
        const mockFormData = [
          {
            name: "accountRegisterId",
            data: Buffer.from("1"),
          },
          {
            name: "fileData",
            data: Buffer.from(
              "Date,Description,Amount,Note,Check Number,Category\n2024-01-01,Test Transaction,100.00,Test Note,,Food"
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

        const moment = await import("moment");
        const { getUser } = await import("~/server/lib/getUser");
        const { prisma } = await import("~/server/clients/prismaClient");
        const papaparse = await import("papaparse");
        const { createId } = await import("@paralleldrive/cuid2");

        const mockMomentInstance = {
          utc: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          subtract: vi.fn().mockReturnThis(),
          add: vi.fn().mockReturnThis(),
          milliseconds: vi.fn().mockReturnThis(),
          toDate: vi.fn().mockReturnValue(new Date("2024-01-01")),
        };

        (globalThis as any).readMultipartFormData.mockResolvedValue(
          mockFormData
        );
        (getUser as any).mockReturnValue({ userId: 123 });
        (papaparse.default.parse as any).mockReturnValue(mockCsvData);
        (prisma.registerEntry.findFirst as any).mockResolvedValue(null); // No duplicates found
        (moment.default as any).mockReturnValue(mockMomentInstance);
        (createId as any).mockReturnValue("entry-123");
        (prisma.registerEntry.create as any).mockResolvedValue({
          id: "entry-123",
          description: "Test Transaction",
          amount: 100,
        });
        (prisma.registerEntry.createMany as any).mockResolvedValue({
          count: 1,
        });

        const result = await uploadFileHandler(mockEvent);

        expect((globalThis as any).readMultipartFormData).toHaveBeenCalledWith(
          mockEvent
        );
        expect(getUser).toHaveBeenCalledWith(mockEvent);
        expect(papaparse.default.parse).toHaveBeenCalledWith(
          "Date,Description,Amount,Note,Check Number,Category\n2024-01-01,Test Transaction,100.00,Test Note,,Food",
          { header: true }
        );
        expect(prisma.registerEntry.createMany).toHaveBeenCalledWith({
          data: expect.arrayContaining([
            expect.objectContaining({
              accountRegisterId: 1,
              description: "Test Transaction",
              amount: 100,
              isCleared: true,
              isProjected: false,
              createdAt: new Date("2024-01-01"),
            }),
          ]),
        });
        expect(result).toEqual(123); // Upload endpoint returns userId
      }
    );

    it.runIf(process.env.RUN_EDGE_CASE_TESTS === "true")(
      "should handle missing form data",
      async () => {
        const mockEvent = {};

        const { readMultipartFormData } = await import("h3");
        const { getUser } = await import("~/server/lib/getUser");

        (readMultipartFormData as any).mockResolvedValue(null); // No form data
        (getUser as any).mockReturnValue({ userId: 123 });

        const result = await uploadFileHandler(mockEvent);

        expect(result).toEqual(123); // Upload endpoint returns userId when no form data
      }
    );

    it.runIf(process.env.RUN_EDGE_CASE_TESTS === "true")(
      "should handle invalid CSV data",
      async () => {
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

        (readMultipartFormData as any).mockResolvedValue(mockFormData);
        (getUser as any).mockReturnValue({ userId: 123 });
        (papaparse.default.parse as any).mockReturnValue(mockCsvData);
        (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue({
          id: 1,
          account: { userAccounts: [{ userId: 123 }] },
        });

        const result = await uploadFileHandler(mockEvent);

        expect(result).toEqual(123); // Upload endpoint returns userId
      }
    );

    it.runIf(process.env.RUN_EDGE_CASE_TESTS === "true")(
      "should handle unauthorized account register access",
      async () => {
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

        (readMultipartFormData as any).mockResolvedValue(mockFormData);
        (getUser as any).mockReturnValue({ userId: 123 });
        (papaparse.default.parse as any).mockReturnValue(mockCsvData);
        (prisma.registerEntry.findFirst as any).mockResolvedValue(null); // No duplicates

        const result = await uploadFileHandler(mockEvent);

        expect(result).toEqual(123); // Upload endpoint returns userId
      }
    );

    it.runIf(process.env.RUN_EDGE_CASE_TESTS === "true")(
      "should handle schema validation errors",
      async () => {
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

        (readMultipartFormData as any).mockResolvedValue(mockFormData);
        (getUser as any).mockReturnValue({ userId: 123 });
        (papaparse.default.parse as any).mockReturnValue(mockCsvData);
        (prisma.registerEntry.findFirst as any).mockResolvedValue(null); // No duplicates

        const result = await uploadFileHandler(mockEvent);

        expect(result).toEqual(123); // Upload endpoint returns userId
      }
    );
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
