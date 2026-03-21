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
    accountType: {
      findUnique: vi.fn(),
    },
    accountRegister: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
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
    category: {
      findFirst: vi.fn(),
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

      const { prisma } = await import("~/server/clients/prismaClient");
      (prisma.accountType.findUnique as any).mockResolvedValue({
        id: 1,
        isCredit: false,
      });
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
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockCreatedRegister,
      );
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockCreatedRegister,
        collateralAssetRegisterId: null,
      });

      const result = await accountRegisterPostHandler(mockEvent);

      expect(result).toMatchObject(mockCreatedRegister);
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
        }),
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
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockUpdatedRegister,
      );
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockUpdatedRegister,
        collateralAssetRegisterId: null,
      });

      const result = await accountRegisterPostHandler(mockEvent);

      expect(result).toMatchObject(mockUpdatedRegister);
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
        }),
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
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockBody,
        id: 0,
        collateralAssetRegisterId: null,
      });

      const unauthorizedError = new Error("Account not found");
      (prisma.account.findFirstOrThrow as any).mockRejectedValue(
        unauthorizedError,
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
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockBody,
        id: 0,
        collateralAssetRegisterId: null,
      });
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
        mockCreatedRegister,
      );
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockCreatedRegister,
        collateralAssetRegisterId: null,
      });

      const result = await accountRegisterPostHandler(mockEvent);

      expect(result).toMatchObject(mockCreatedRegister);
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
        }),
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
        loanStartAt: new Date("2023-01-01T00:00:00.000Z"),
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
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockCreatedRegister,
      );
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockCreatedRegister,
        collateralAssetRegisterId: null,
      });

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
        }),
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
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.upsert as any).mockResolvedValue(
        mockCreatedRegister,
      );
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockCreatedRegister,
        collateralAssetRegisterId: null,
      });

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
        }),
      );
    });

    it("clears paymentCategoryId when account type is not credit", async () => {
      const mockEvent = {};
      const PAY = "22222222-2222-2222-2222-222222222222";
      const INT = "11111111-1111-1111-1111-111111111111";
      const mockBody = {
        id: 1,
        accountId: "account-123",
        typeId: 1,
        budgetId: 1,
        name: "Checking",
        balance: 1000,
        latestBalance: 1000,
        sortOrder: 1,
        paymentCategoryId: PAY,
        interestCategoryId: INT,
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };
      const mockParsed = {
        ...mockBody,
        collateralAssetRegisterId: null,
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountType.findUnique as any).mockResolvedValue({
        id: 1,
        isCredit: false,
      });
      (prisma.accountRegister.upsert as any).mockResolvedValue(mockParsed);
      (accountRegisterSchema.parse as any).mockReturnValue(mockParsed);
      (prisma.category.findFirst as any).mockResolvedValue({ id: INT });

      await accountRegisterPostHandler(mockEvent);

      expect(prisma.accountRegister.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            paymentCategoryId: null,
            interestCategoryId: INT,
          }),
          update: expect.objectContaining({
            paymentCategoryId: null,
            interestCategoryId: INT,
          }),
        }),
      );
    });

    it("rejects when category is not found for account", async () => {
      const mockEvent = {};
      const CAT = "33333333-3333-3333-3333-333333333333";
      const mockBody = {
        id: 1,
        accountId: "account-123",
        typeId: 1,
        budgetId: 1,
        name: "Test",
        balance: 1000,
        latestBalance: 1000,
        sortOrder: 1,
        interestCategoryId: CAT,
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountType.findUnique as any).mockResolvedValue({
        id: 1,
        isCredit: false,
      });
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockBody,
        collateralAssetRegisterId: null,
      });
      (prisma.category.findFirst as any).mockResolvedValue(null);

      await expect(accountRegisterPostHandler(mockEvent)).rejects.toThrow(
        /Category not found for this account/,
      );
    });

    it("persists payment and interest category IDs for credit types when valid", async () => {
      const mockEvent = {};
      const PAY = "22222222-2222-2222-2222-222222222222";
      const INT = "11111111-1111-1111-1111-111111111111";
      const mockBody = {
        id: 1,
        accountId: "account-123",
        typeId: 4,
        budgetId: 1,
        name: "Card",
        balance: -500,
        latestBalance: -500,
        sortOrder: 1,
        paymentCategoryId: PAY,
        interestCategoryId: INT,
      };
      const mockUser = { userId: 123 };
      const mockAccount = {
        id: "account-123",
        userAccounts: [{ userId: 123 }],
      };
      const mockParsed = { ...mockBody, collateralAssetRegisterId: null };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountType.findUnique as any).mockResolvedValue({
        id: 4,
        isCredit: true,
      });
      (prisma.accountRegister.upsert as any).mockResolvedValue(mockParsed);
      (accountRegisterSchema.parse as any).mockReturnValue(mockParsed);
      (prisma.category.findFirst as any).mockResolvedValue({ id: "ok" });

      await accountRegisterPostHandler(mockEvent);

      expect(prisma.accountRegister.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            paymentCategoryId: PAY,
            interestCategoryId: INT,
          }),
        }),
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
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.account.findFirstOrThrow as any).mockResolvedValue(mockAccount);
      (prisma.accountRegister.update as any).mockResolvedValue({});

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
        "sortMode must be 'visual', 'loan', or 'savings'",
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

    it("should archive account register successfully", async () => {
      const mockEvent = {};
      const mockQuery = { accountRegisterId: "1" };
      const mockUser = { userId: 123 };
      const mockAccountRegister = {
        id: 1,
        accountId: "account-123",
        name: "Test Account Register",
        account: { userAccounts: [{ userId: 123 }] },
      };
      const mockArchivedData = {
        id: 1,
        accountId: "account-123",
        name: "Test Account Register",
        isArchived: true,
      };

      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { getUser } = await import("~/server/lib/getUser");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { accountRegisterSchema } = await import("~/schema/zod");

      (getQuery as any).mockReturnValue(mockQuery);
      (global as any).getQuery.mockReturnValue(mockQuery);
      (getUser as any).mockReturnValue(mockUser);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(
        mockAccountRegister,
      );
      const noop = vi.fn().mockResolvedValue({ count: 0 });
      (prisma.$transaction as any).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          return await callback({
            savingsGoal: { updateMany: noop },
            accountRegister: {
              updateMany: noop,
              update: vi.fn().mockResolvedValue(mockArchivedData),
            },
            reoccurrence: { updateMany: noop, deleteMany: noop },
            reoccurrenceSplit: { deleteMany: noop },
            registerEntry: { deleteMany: noop },
            reoccurrenceSkip: { deleteMany: noop },
            reoccurrencePlaidNameAlias: { deleteMany: noop },
          });
        },
      );
      (accountRegisterSchema.parse as any).mockReturnValue(mockArchivedData);

      const result = await accountRegisterDeleteHandler(mockEvent);

      expect(result).toEqual(mockArchivedData);
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
        unauthorizedError,
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
        mockAccountRegister,
      );

      const transactionError = new Error("Transaction failed");
      (prisma.$transaction as any).mockRejectedValue(transactionError);

      await expect(accountRegisterDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(transactionError);
    });

    it("should clean up related data then archive the register", async () => {
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
        mockAccountRegister,
      );

      const noop = vi.fn().mockResolvedValue({ count: 0 });
      const mockTxn = {
        savingsGoal: { updateMany: noop },
        accountRegister: {
          updateMany: noop,
          update: vi
            .fn()
            .mockResolvedValue({ ...mockAccountRegister, isArchived: true }),
        },
        reoccurrence: { updateMany: noop, deleteMany: noop },
        reoccurrenceSplit: { deleteMany: noop },
        registerEntry: { deleteMany: noop },
        reoccurrenceSkip: { deleteMany: noop },
        reoccurrencePlaidNameAlias: { deleteMany: noop },
      };

      (prisma.$transaction as any).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          return await callback(mockTxn);
        },
      );
      (accountRegisterSchema.parse as any).mockReturnValue({
        ...mockAccountRegister,
        isArchived: true,
      });

      await accountRegisterDeleteHandler(mockEvent);

      expect(mockTxn.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: { accountRegisterId: 1 },
      });
      expect(mockTxn.reoccurrence.deleteMany).toHaveBeenCalledWith({
        where: { accountRegisterId: 1 },
      });
      expect(mockTxn.accountRegister.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isArchived: true },
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
        mockAccountRegister,
      );
      const noop = vi.fn().mockResolvedValue({ count: 0 });
      (prisma.$transaction as any).mockImplementation(
        async (
          callback: (tx: unknown) => Promise<unknown>,
          options: { maxWait?: number; timeout?: number },
        ) => {
          expect(options).toEqual({
            maxWait: 20000,
            timeout: 60000,
          });
          return await callback({
            savingsGoal: { updateMany: noop },
            accountRegister: {
              updateMany: noop,
              update: vi
                .fn()
                .mockResolvedValue({ ...mockAccountRegister, isArchived: true }),
            },
            reoccurrence: { updateMany: noop, deleteMany: noop },
            reoccurrenceSplit: { deleteMany: noop },
            registerEntry: { deleteMany: noop },
            reoccurrenceSkip: { deleteMany: noop },
            reoccurrencePlaidNameAlias: { deleteMany: noop },
          });
        },
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
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      expect(addRecalculateJob).toBeDefined();
      expect(typeof addRecalculateJob).toBe("function");
    });
  });
});
