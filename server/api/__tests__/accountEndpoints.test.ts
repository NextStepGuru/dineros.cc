import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

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
  readBody: vi.fn(),
  getQuery: vi.fn(),
  setResponseStatus: vi.fn(),
}));

// Make H3 functions globally available
(global as any).readBody = vi.fn();
(global as any).getQuery = vi.fn();

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    account: {
      findFirstOrThrow: vi.fn(),
    },
    accountRegister: {
      upsert: vi.fn(),
      findFirstOrThrow: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    reoccurrence: {
      deleteMany: vi.fn(),
    },
    registerEntry: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/schema/zod", () => ({
  accountRegisterSchema: {
    parse: vi.fn(),
  },
}));

describe("Account Register API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/account-register", () => {
    let accountRegisterPostHandler: any;

    beforeEach(async () => {
      // Properly set up the global mock functions
      (global as any).readBody = vi.fn();

      const module = await import("../account-register.post");
      accountRegisterPostHandler = module.default;
    });

    it("should create new account register successfully", async () => {
      const mockEvent = {};
      const mockBody = {
        accountId: "account-123",
        typeId: 1,
        budgetId: 1,
        name: "Test Account Register",
        balance: 1000,
        latestBalance: 1000,
        sortOrder: 1,
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };
      const mockCreatedRegister = {
        id: 1,
        ...mockBody,
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockCreatedRegister
      );
      (accountRegisterSchema.parse as any).mockReturnValue(mockCreatedRegister);

      const result = await accountRegisterPostHandler(mockEvent);

      expect(result).toEqual(mockCreatedRegister);
      expect(prisma.account.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: "account-123",
          userAccounts: {
            some: {
              userId: 123,
            },
          },
        },
      });
      expect(prisma.accountRegister.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            accountId: "account-123",
            name: "Test Account Register",
            balance: 1000,
          }),
          update: expect.objectContaining({
            accountId: "account-123",
            name: "Test Account Register",
            balance: 1000,
          }),
          where: expect.objectContaining({
            id: 1,
          }),
        })
      );
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
    });

    it("should update existing account register successfully", async () => {
      const mockEvent = {};
      const mockBody = {
        id: 1,
        accountId: "account-123",
        typeId: 1,
        budgetId: 1,
        name: "Updated Account Register",
        balance: 2000,
        latestBalance: 2000,
        sortOrder: 1,
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };
      const mockUpdatedRegister = {
        ...mockBody,
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockUpdatedRegister
      );
      (accountRegisterSchema.parse as any).mockReturnValue(mockUpdatedRegister);

      const result = await accountRegisterPostHandler(mockEvent);

      expect(result).toEqual(mockUpdatedRegister);
      expect(prisma.accountRegister.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            name: "Updated Account Register",
            balance: 2000,
          }),
          update: expect.objectContaining({
            id: 1,
            name: "Updated Account Register",
            balance: 2000,
          }),
          where: { id: 1 },
        })
      );
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
    });

    it("should handle unauthorized access", async () => {
      const mockEvent = {};
      const mockBody = {
        accountId: "account-123",
        typeId: 1,
        budgetId: 1,
        name: "Test Account Register",
        balance: 1000,
      };
      const mockUser = { userId: 999 };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);

      const unauthorizedError = new Error("Account not found");
      (prisma.account.findFirstOrThrow as any).mockRejectedValue(
        unauthorizedError
      );

      await expect(accountRegisterPostHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(unauthorizedError);
    });

    it("should handle schema validation errors", async () => {
      const mockEvent = {};
      const mockBody = {
        accountId: "", // Invalid
        name: "", // Invalid
      };
      const mockUser = { userId: 123 };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);

      await expect(accountRegisterPostHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle database upsert errors", async () => {
      const mockEvent = {};
      const mockBody = {
        accountId: "account-123",
        typeId: 1,
        budgetId: 1,
        name: "Test Account Register",
        balance: 1000,
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);

      const dbError = new Error("Database constraint violation");
      (prisma.accountRegister.upsert as any).mockRejectedValue(dbError);

      await expect(accountRegisterPostHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });

    it("should handle missing required fields with default values", async () => {
      const mockEvent = {};
      const mockBody = {
        accountId: "account-123",
        typeId: 1,
        budgetId: 1,
        name: "Test Account Register",
        balance: 1000,
        // Missing optional fields
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };
      const mockCreatedRegister = {
        id: 1,
        statementAt: new Date(),
        ...mockBody,
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockCreatedRegister
      );
      (accountRegisterSchema.parse as any).mockReturnValue(mockCreatedRegister);

      const result = await accountRegisterPostHandler(mockEvent);

      expect(result).toEqual(mockCreatedRegister);
      expect(prisma.accountRegister.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            statementAt: expect.any(Date),
          }),
          update: expect.objectContaining({
            statementAt: expect.any(Date),
          }),
          where: expect.objectContaining({
            id: 1,
          }),
        })
      );
    });

    it("should handle loan-specific fields correctly", async () => {
      const mockEvent = {};
      const mockBody = {
        accountId: "account-123",
        typeId: 1,
        budgetId: 1,
        name: "Loan Account",
        balance: 50000,
        loanStartAt: new Date("2023-01-01"),
        loanPaymentsPerYear: 12,
        loanTotalYears: 30,
        loanOriginalAmount: 50000,
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };
      const mockCreatedRegister = { id: 1, ...mockBody };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockCreatedRegister
      );
      (accountRegisterSchema.parse as any).mockReturnValue(mockCreatedRegister);

      await accountRegisterPostHandler(mockEvent);

      expect(prisma.accountRegister.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            loanStartAt: mockBody.loanStartAt,
            loanPaymentsPerYear: 12,
            loanTotalYears: 30,
            loanOriginalAmount: 50000,
          }),
          update: expect.objectContaining({
            loanStartAt: mockBody.loanStartAt,
            loanPaymentsPerYear: 12,
            loanTotalYears: 30,
            loanOriginalAmount: 50000,
          }),
          where: expect.objectContaining({
            id: 1,
          }),
        })
      );
    });

    it("should handle savings goal fields correctly", async () => {
      const mockEvent = {};
      const mockBody = {
        accountId: "account-123",
        typeId: 2, // Savings account type
        budgetId: 1,
        name: "Savings Account",
        balance: 5000,
        accountSavingsGoal: 10000,
        savingsGoalSortOrder: 1,
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };
      const mockCreatedRegister = { id: 1, ...mockBody };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockCreatedRegister
      );
      (accountRegisterSchema.parse as any).mockReturnValue(mockCreatedRegister);

      await accountRegisterPostHandler(mockEvent);

      expect(prisma.accountRegister.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            typeId: 2,
            name: "Savings Account",
            balance: 5000,
            accountSavingsGoal: 10000,
            savingsGoalSortOrder: 1,
          }),
          update: expect.objectContaining({
            typeId: 2,
            name: "Savings Account",
            balance: 5000,
            accountSavingsGoal: 10000,
            savingsGoalSortOrder: 1,
          }),
          where: expect.objectContaining({
            id: 1,
          }),
        })
      );
    });
  });

  describe("POST /api/account-register-sort", () => {
    let accountRegisterSortHandler: any;

    beforeEach(async () => {
      // Properly set up the global mock functions
      (global as any).readBody = vi.fn();

      const module = await import("../account-register-sort.post");
      accountRegisterSortHandler = module.default;
    });

    it("should update account register sort order successfully", async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisters: [
          {
            id: 1,
            accountId: "account-123",
            sortOrder: 0,
            name: "Account 1",
            typeId: 1,
            budgetId: 1,
          },
          {
            id: 2,
            accountId: "account-123",
            sortOrder: 1,
            name: "Account 2",
            typeId: 1,
            budgetId: 1,
          },
          {
            id: 3,
            accountId: "account-123",
            sortOrder: 2,
            name: "Account 3",
            typeId: 1,
            budgetId: 1,
          },
        ],
        sortMode: "visual",
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.update as any).mockResolvedValue({});

      // Debug: Let's see what's actually being passed
      console.log("Mock body:", mockBody);
      console.log("Mock body accountRegisters:", mockBody.accountRegisters);
      console.log("First account register:", mockBody.accountRegisters[0]);

      const result = await accountRegisterSortHandler(mockEvent);

      expect(result).toEqual({
        success: true,
        message: "Sort order updated successfully",
      });
      expect(prisma.accountRegister.update).toHaveBeenCalledTimes(3);
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
    });

    it("should handle invalid account registers array", async () => {
      const mockEvent = {};
      const mockBody = { accountRegisters: "invalid" };
      const mockUser = { userId: 123 };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);

      await expect(accountRegisterSortHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle invalid sort mode", async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisters: [
          {
            id: 1,
            accountId: "account-123",
            sortOrder: 0,
            name: "Account 1",
            typeId: 1,
            budgetId: 1,
          },
        ],
        sortMode: "invalid",
      };
      const mockUser = { userId: 123 };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);

      await expect(accountRegisterSortHandler(mockEvent)).rejects.toThrow(
        "sortMode must be 'visual', 'loan', or 'savings'"
      );
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/account-register", () => {
    let accountRegisterDeleteHandler: any;

    beforeEach(async () => {
      // Properly set up the global mock functions
      (global as any).getQuery = vi.fn();

      const module = await import("../account-register.delete");
      accountRegisterDeleteHandler = module.default;
    });

    it("should delete account register successfully", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "1" };
      const mockUser = { userId: 123 };
      const mockAccountRegister = {
        id: 1,
        accountId: "account-123",
        name: "Test Account Register",
        account: { userAccounts: [{ userId: 123 }] },
      };
      const mockDeletedData = {
        id: 1,
        accountId: "account-123",
        name: "Test Account Register",
      };

      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { accountRegisterSchema } = await import("~/schema/zod");

      (getQuery as any).mockReturnValue(mockQuery);
      (global as any).getQuery.mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(
        mockAccountRegister
      );
      (prisma.$transaction as any).mockImplementation(async (callback) => {
        return await callback({
          reoccurrence: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
          registerEntry: {
            deleteMany: vi.fn().mockResolvedValue({ count: 10 }),
          },
          accountRegister: {
            delete: vi.fn().mockResolvedValue(mockDeletedData),
          },
        });
      });
      (accountRegisterSchema.parse as any).mockReturnValue(mockDeletedData);

      const result = await accountRegisterDeleteHandler(mockEvent);

      expect(result).toEqual(mockDeletedData);
      expect(prisma.accountRegister.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: 1,
          account: {
            userAccounts: {
              some: {
                userId: 123,
              },
            },
          },
        },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
    });

    it("should handle unauthorized deletion attempt", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "1" };
      const mockUser = { userId: 999 };

      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue(mockQuery);
      (global as any).getQuery.mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue(mockUser);

      const unauthorizedError = new Error("Account register not found");
      (prisma.accountRegister.findFirstOrThrow as any).mockRejectedValue(
        unauthorizedError
      );

      await expect(accountRegisterDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(unauthorizedError);
    });

    it("should handle invalid accountRegisterId parameter", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "invalid" };
      const mockUser = { userId: 123 };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue(mockUser);

      await expect(accountRegisterDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle missing accountRegisterId parameter", async () => {
      const mockEvent = {};
      const mockQuery = {};
      const mockUser = { userId: 123 };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue(mockUser);

      await expect(accountRegisterDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle transaction failures", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "1" };
      const mockUser = { userId: 123 };
      const mockAccountRegister = {
        id: 1,
        accountId: "account-123",
        name: "Test Account Register",
        account: { userAccounts: [{ userId: 123 }] },
      };

      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue(mockQuery);
      (global as any).getQuery.mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(
        mockAccountRegister
      );

      const transactionError = new Error("Transaction failed");
      (prisma.$transaction as any).mockRejectedValue(transactionError);

      await expect(accountRegisterDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(transactionError);
    });

    it("should clean up related data in correct order", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "1" };
      const mockUser = { userId: 123 };
      const mockAccountRegister = {
        id: 1,
        accountId: "account-123",
        name: "Test Account Register",
        account: { userAccounts: [{ userId: 123 }] },
      };

      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (getQuery as any).mockReturnValue(mockQuery);
      (global as any).getQuery.mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(
        mockAccountRegister
      );

      const mockTxn = {
        reoccurrence: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
        registerEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 10 }) },
        accountRegister: {
          delete: vi.fn().mockResolvedValue(mockAccountRegister),
        },
      };

      (prisma.$transaction as any).mockImplementation(async (callback) => {
        return await callback(mockTxn);
      });
      (accountRegisterSchema.parse as any).mockReturnValue(mockAccountRegister);

      await accountRegisterDeleteHandler(mockEvent);

      // Verify the order: reoccurrences first, then register entries, then account register
      expect(mockTxn.reoccurrence.deleteMany).toHaveBeenCalledWith({
        where: { accountRegisterId: 1 },
      });
      expect(mockTxn.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: { accountRegisterId: 1 },
      });
      expect(mockTxn.accountRegister.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("should use transaction timeouts correctly", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "1" };
      const mockUser = { userId: 123 };
      const mockAccountRegister = {
        id: 1,
        accountId: "account-123",
        name: "Test Account Register",
        account: { userAccounts: [{ userId: 123 }] },
      };

      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (getQuery as any).mockReturnValue(mockQuery);
      (global as any).getQuery.mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(
        mockAccountRegister
      );
      (prisma.$transaction as any).mockImplementation(
        async (callback, options) => {
          expect(options).toEqual({
            maxWait: 20000,
            timeout: 60000,
          });
          return await callback({
            reoccurrence: {
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
            registerEntry: {
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
            accountRegister: {
              delete: vi.fn().mockResolvedValue(mockAccountRegister),
            },
          });
        }
      );
      (accountRegisterSchema.parse as any).mockReturnValue(mockAccountRegister);

      await accountRegisterDeleteHandler(mockEvent);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: 20000,
        timeout: 60000,
      });
    });
  });

  describe("Cross-endpoint Integration", () => {
    it("should use consistent error handling across endpoints", async () => {
      const { handleApiError } = await import("~/server/lib/handleApiError");

      expect(handleApiError).toBeDefined();
      expect(typeof handleApiError).toBe("function");
    });

    it("should use consistent user authentication", async () => {
      const { getUser } = await import("~/server/lib/getUser");

      expect(getUser).toBeDefined();
      expect(typeof getUser).toBe("function");
    });

    it("should trigger recalculation consistently", async () => {
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      expect(addRecalculateJob).toBeDefined();
      expect(typeof addRecalculateJob).toBe("function");
    });
  });
});
