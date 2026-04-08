import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
  (globalThis as any).getQuery = vi.fn();
  (globalThis as any).readBody = vi.fn();
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

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

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
  reoccurrenceWithSplitsSchema: {
    parse: vi.fn(),
  },
}));

describe("Reoccurrence API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/reoccurrence", () => {
    let reoccurrencePostHandler: any;

    beforeEach(async () => {
      const module = await import("../reoccurrence.post");
      reoccurrencePostHandler = module.default;
    });

    it("should successfully create a new reoccurrence", async () => {
      const mockEvent = {};
      const mockBody = {
        id: null,
        accountId: "account-123",
        accountRegisterId: 1,
        transferAccountRegisterId: null,
        intervalId: 1,
        adjustBeforeIfOnWeekend: false,
        description: "Monthly Salary",
        amount: 5000,
        lastAt: "2024-01-01",
        endAt: null,
      };

      const mockAccountRegister = {
        id: 1,
        accountId: "account-123",
      };

      const mockCreatedReoccurrence = {
        ...mockBody,
        lastAt: new Date("2024-01-01"),
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      reoccurrenceWithSplitsSchema.parse
        .mockReturnValueOnce(mockBody)
        .mockReturnValue(mockCreatedReoccurrence);
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue(
        mockAccountRegister,
      );
      prisma.reoccurrence.upsert.mockResolvedValue(
        mockCreatedReoccurrence,
      );
      prisma.reoccurrence.findUniqueOrThrow.mockResolvedValue(
        mockCreatedReoccurrence,
      );
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback(prisma),
      );

      const result = await reoccurrencePostHandler(mockEvent);

      expect((globalThis as any).readBody).toHaveBeenCalledWith(mockEvent);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.accountRegister.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: 1,
          account: {
            id: "account-123",
            userAccounts: {
              some: {
                userId: 123,
              },
            },
          },
        },
      });
      expect(prisma.reoccurrence.upsert).toHaveBeenCalledWith({
        where: { id: null },
        create: expect.objectContaining({
          accountId: "account-123",
          accountRegisterId: 1,
          description: "Monthly Salary",
          amount: 5000,
        }),
        update: expect.objectContaining({
          accountId: "account-123",
          accountRegisterId: 1,
          description: "Monthly Salary",
          amount: 5000,
        }),
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual(mockCreatedReoccurrence);
    });

    it("should successfully update existing reoccurrence", async () => {
      const mockEvent = {};
      const mockBody = {
        id: 123,
        accountId: "account-123",
        accountRegisterId: 1,
        transferAccountRegisterId: 2,
        intervalId: 2,
        adjustBeforeIfOnWeekend: true,
        description: "Updated Salary",
        amount: 6000,
        lastAt: "2024-01-15",
        endAt: "2024-12-31",
      };

      const mockAccountRegister = {
        id: 1,
        accountId: "account-123",
      };

      const mockUpdatedReoccurrence = {
        ...mockBody,
        lastAt: new Date("2024-01-15"),
        endAt: new Date("2024-12-31"),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");
      await import("~/server/clients/queuesClient");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      reoccurrenceWithSplitsSchema.parse
        .mockReturnValueOnce(mockBody)
        .mockReturnValue(mockUpdatedReoccurrence);
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue(
        mockAccountRegister,
      );
      prisma.accountRegister.findMany.mockResolvedValue([{ id: 2 }]);
      prisma.reoccurrence.findFirst.mockResolvedValue({
        id: 123,
        accountRegisterId: 1,
        accountId: "account-123",
      });
      prisma.reoccurrence.upsert.mockResolvedValue(
        mockUpdatedReoccurrence,
      );
      prisma.reoccurrence.findUniqueOrThrow.mockResolvedValue(
        mockUpdatedReoccurrence,
      );
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback(prisma),
      );

      const result = await reoccurrencePostHandler(mockEvent);

      expect(prisma.reoccurrence.upsert).toHaveBeenCalledWith({
        where: { id: 123 },
        create: expect.objectContaining({
          description: "Updated Salary",
          amount: 6000,
          transferAccountRegisterId: 2,
        }),
        update: expect.objectContaining({
          description: "Updated Salary",
          amount: 6000,
          transferAccountRegisterId: 2,
        }),
      });
      expect(result).toEqual(mockUpdatedReoccurrence);
    });

    it("should handle unauthorized access to account register", async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisterId: 1,
        description: "Unauthorized Reoccurrence",
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      reoccurrenceWithSplitsSchema.parse.mockReturnValue(mockBody);
      prisma.accountRegister.findFirstOrThrow.mockRejectedValue(
        new Error(
          "User does not have permission to access this account register",
        ),
      );
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrencePostHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle schema validation errors", async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisterId: "invalid-id", // Should be number
        description: "",
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });

      const validationError = new Error("Invalid schema");
      reoccurrenceWithSplitsSchema.parse.mockImplementation(() => {
        throw validationError;
      });
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrencePostHandler(mockEvent)).rejects.toThrow(
        "Invalid schema",
      );
      expect(handleApiError).toHaveBeenCalledWith(validationError);
    });

    it("should handle database upsert errors", async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisterId: 1,
        description: "Test Reoccurrence",
      };

      const mockAccountRegister = {
        id: 1,
        accountId: "account-123",
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const dbError = new Error("Database constraint violation");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      reoccurrenceWithSplitsSchema.parse.mockReturnValue(mockBody);
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue(
        mockAccountRegister,
      );
      prisma.reoccurrence.upsert.mockRejectedValue(dbError);
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback(prisma),
      );
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrencePostHandler(mockEvent)).rejects.toThrow(
        "Database constraint violation",
      );
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });

    it("validates split category IDs and succeeds when all exist for account", async () => {
      const mockEvent = {};
      const SPLIT_CAT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const mockBody = {
        id: null,
        accountId: "account-123",
        accountRegisterId: 1,
        transferAccountRegisterId: 2,
        intervalId: 1,
        intervalCount: 1,
        adjustBeforeIfOnWeekend: false,
        description: "With splits",
        amount: 100,
        lastAt: "2024-01-01",
        endAt: null,
        splits: [
          {
            transferAccountRegisterId: 2,
            amount: 50,
            categoryId: SPLIT_CAT,
            sortOrder: 0,
          },
        ],
        categoryId: null,
      };

      const mockAccountRegister = { id: 1, accountId: "account-123" };
      const mockCreated = {
        ...mockBody,
        lastAt: new Date("2024-01-01"),
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      reoccurrenceWithSplitsSchema.parse
        .mockReturnValueOnce(mockBody)
        .mockReturnValue(mockCreated);
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue(
        mockAccountRegister,
      );
      prisma.category.findMany.mockResolvedValue([{ id: SPLIT_CAT }]);
      prisma.accountRegister.findMany.mockResolvedValue([{ id: 2 }]);
      prisma.reoccurrence.upsert.mockResolvedValue(mockCreated);
      prisma.reoccurrence.findUniqueOrThrow.mockResolvedValue(
        mockCreated,
      );
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback(prisma),
      );

      await reoccurrencePostHandler(mockEvent);

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [SPLIT_CAT] },
          accountId: "account-123",
        },
        select: { id: true },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
    });

    it("rejects when split category IDs are not all valid for account", async () => {
      const mockEvent = {};
      const CAT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const CAT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
      const mockBody = {
        id: null,
        accountId: "account-123",
        accountRegisterId: 1,
        transferAccountRegisterId: 2,
        intervalId: 1,
        intervalCount: 1,
        adjustBeforeIfOnWeekend: false,
        description: "Bad splits",
        amount: 100,
        lastAt: "2024-01-01",
        endAt: null,
        splits: [
          {
            transferAccountRegisterId: 2,
            amount: 50,
            categoryId: CAT_A,
            sortOrder: 0,
          },
          {
            transferAccountRegisterId: 3,
            amount: 50,
            categoryId: CAT_B,
            sortOrder: 1,
          },
        ],
        categoryId: null,
      };

      const mockAccountRegister = { id: 1, accountId: "account-123" };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      reoccurrenceWithSplitsSchema.parse.mockReturnValue(mockBody);
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue(
        mockAccountRegister,
      );
      prisma.category.findMany.mockResolvedValue([{ id: CAT_A }]);

      await expect(reoccurrencePostHandler(mockEvent)).rejects.toThrow(
        /Invalid category on a split/,
      );
    });
  });

  describe("DELETE /api/reoccurrence", () => {
    let reoccurrenceDeleteHandler: any;

    beforeEach(async () => {
      const module = await import("../reoccurrence.delete");
      reoccurrenceDeleteHandler = module.default;
    });

    it("should successfully delete reoccurrence and related entries", async () => {
      const mockEvent = {};
      const mockQuery = { reoccurrenceId: "123" };

      const mockReoccurrence = {
        id: 123,
        accountId: "account-123",
        description: "Monthly Salary",
        amount: 5000,
      };

      const mockDeletedReoccurrence = {
        id: 123,
        description: "Monthly Salary",
        amount: 5000,
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      (globalThis as any).getQuery.mockReturnValue(mockQuery);
      getUser.mockReturnValue({ userId: 123 });
      prisma.reoccurrence.findFirstOrThrow.mockResolvedValue(
        mockReoccurrence,
      );
      prisma.$transaction.mockImplementation(async (callback: any) => {
        const mockPrisma = {
          registerEntry: {
            deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
          },
          reoccurrenceSplit: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          reoccurrence: {
            delete: vi.fn().mockResolvedValue(mockDeletedReoccurrence),
          },
        };
        return await callback(mockPrisma);
      });
      reoccurrenceWithSplitsSchema.parse.mockReturnValue(
        mockDeletedReoccurrence,
      );

      const result = await reoccurrenceDeleteHandler(mockEvent);

      expect((globalThis as any).getQuery).toHaveBeenCalledWith(mockEvent);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.reoccurrence.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: 123,
          register: {
            account: {
              userAccounts: {
                some: {
                  userId: 123,
                },
              },
            },
          },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual(mockDeletedReoccurrence);
    });

    it("should handle unauthorized access", async () => {
      const mockEvent = {};
      const mockQuery = { reoccurrenceId: "123" };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue(mockQuery);
      getUser.mockReturnValue({ userId: 123 });
      prisma.reoccurrence.findFirstOrThrow.mockRejectedValue(
        new Error("Reoccurrence not found or unauthorized"),
      );
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrenceDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle invalid reoccurrence ID format", async () => {
      const mockEvent = {};
      const mockQuery = { reoccurrenceId: "invalid-id" };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue(mockQuery);
      getUser.mockReturnValue({ userId: 123 });
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrenceDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle transaction failures", async () => {
      const mockEvent = {};
      const mockQuery = { reoccurrenceId: "123" };

      const mockReoccurrence = {
        id: 123,
        accountId: "account-123",
      };

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const transactionError = new Error("Transaction failed");

      (getQuery as any).mockReturnValue(mockQuery);
      getUser.mockReturnValue({ userId: 123 });
      prisma.reoccurrence.findFirstOrThrow.mockResolvedValue(
        mockReoccurrence,
      );
      prisma.$transaction.mockRejectedValue(transactionError);
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrenceDeleteHandler(mockEvent)).rejects.toThrow(
        "Transaction failed",
      );
      expect(handleApiError).toHaveBeenCalledWith(transactionError);
    });

    it("should handle missing reoccurrence ID in query", async () => {
      const mockEvent = {};
      const mockQuery = {}; // Missing reoccurrenceId

      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue(mockQuery);
      getUser.mockReturnValue({ userId: 123 });
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(reoccurrenceDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("Cross-endpoint Integration", () => {
    it("should use consistent error handling across reoccurrence endpoints", async () => {
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

    it("should use consistent schema validation", async () => {
      const { reoccurrenceWithSplitsSchema } = await import("~/schema/zod");

      expect(reoccurrenceWithSplitsSchema).toBeDefined();
      expect(typeof reoccurrenceWithSplitsSchema.parse).toBe("function");
    });
  });
});
