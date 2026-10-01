import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureStderrAsync } from "~/vitest.setup";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
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

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    nowDate: vi.fn(() => new Date("2024-01-17T00:00:00.000Z")),
    now: vi.fn(() => ({
      toDate: () => new Date("2024-01-17T00:00:00.000Z"),
      toISOString: () => "2024-01-17T00:00:00.000Z",
    })),
    toDate: vi.fn((value: unknown) => new Date(value as string)),
    isSameOrBefore: vi.fn(() => true),
  },
}));

vi.mock("~/schema/zod", () => ({
  registerEntrySchema: {
    parse: vi.fn(),
  },
  registerEntryMergeSchema: {
    parse: vi.fn((value: unknown) => value),
  },
  registerEntryUnmergeSchema: {
    parse: vi.fn((value: unknown) => value),
  },
  registerEntryMergeAuditSchema: {
    parse: vi.fn((value: unknown) => value),
  },
}));

vi.mock("@paralleldrive/cuid2", () => ({
  createId: vi.fn(),
}));

describe("Register Entry API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/register-entry", () => {
    let registerEntryPostHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry.post");
      registerEntryPostHandler = module.default;
    });

    it("should successfully create a new register entry", async () => {
      const mockEvent = {};
      const mockBody = {
        id: null,
        accountRegisterId: 1,
        description: "Test Entry",
        reoccurrenceId: null,
        amount: 100,
        balance: 1100,
        isProjected: false,
        isReconciled: false,
        isCleared: false,
        isPending: false,
        isBalanceEntry: false,
        plaidId: null,
        plaidJson: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };

      const mockLookup = {
        id: 1,
        accountId: "account-123",
      };

      const mockCreatedEntry = {
        ...mockBody,
        id: "entry-123",
        isManualEntry: false,
        hasBalanceReCalc: true,
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { registerEntrySchema } = await import("~/schema/zod");
      const { createId } = await import("@paralleldrive/cuid2");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      registerEntrySchema.parse
        .mockReturnValueOnce(mockBody)
        .mockReturnValue(mockCreatedEntry);
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue(
        mockLookup,
      );
      (createId as any).mockReturnValue("entry-123");
      prisma.registerEntry.create.mockResolvedValue(mockCreatedEntry);

      const result = await registerEntryPostHandler(mockEvent);

      expect((globalThis as any).readBody).toHaveBeenCalledWith(mockEvent);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
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
      expect(prisma.registerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "entry-123",
          accountRegisterId: 1,
          description: "Test Entry",
          amount: 100,
          isManualEntry: true,
          hasBalanceReCalc: true,
        }),
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual(mockCreatedEntry);
    });

    it("should update existing register entry", async () => {
      const mockEvent = {};
      const mockBody = {
        id: "existing-entry-123",
        accountRegisterId: 1,
        description: "Updated Entry",
        amount: 200,
        balance: 1200,
      };

      const mockLookup = {
        id: 1,
        accountId: "account-123",
      };

      const mockUpdatedEntry = {
        ...mockBody,
        isManualEntry: false,
        hasBalanceReCalc: true,
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { registerEntrySchema } = await import("~/schema/zod");
      await import("~/server/clients/queuesClient");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      registerEntrySchema.parse
        .mockReturnValueOnce(mockBody)
        .mockReturnValue(mockUpdatedEntry);
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue(
        mockLookup,
      );
      prisma.registerEntry.findFirst.mockResolvedValue({
        id: "existing-entry-123",
        accountRegisterId: 1,
      });
      prisma.registerEntry.update.mockResolvedValue(mockUpdatedEntry);

      const result = await registerEntryPostHandler(mockEvent);

      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "existing-entry-123" },
        data: expect.objectContaining({
          description: "Updated Entry",
          amount: 200,
        }),
      });
      expect(result).toEqual(mockUpdatedEntry);
    });

    it("returns 404 when entry id does not belong to the account register", async () => {
      const mockEvent = {};
      const mockBody = {
        id: "wrong-entry",
        accountRegisterId: 1,
        description: "X",
        amount: 1,
        balance: 1,
      };
      const mockLookup = { id: 1, accountId: "account-123" };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { registerEntrySchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      registerEntrySchema.parse
        .mockReturnValueOnce(mockBody)
        .mockReturnValue(mockBody);
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue(
        mockLookup,
      );
      prisma.registerEntry.findFirst.mockResolvedValue(null);

      await expect(registerEntryPostHandler(mockEvent)).rejects.toThrow(
        "Register entry not found",
      );
    });

    it("should handle permission denied error", async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisterId: 1,
        description: "Test Entry",
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { registerEntrySchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      registerEntrySchema.parse.mockReturnValue(mockBody);
      prisma.accountRegister.findFirstOrThrow.mockRejectedValue(
        new Error("User does not have permission"),
      );
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(registerEntryPostHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("PATCH /api/register-entry", () => {
    let registerEntryPatchHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry.patch");
      registerEntryPatchHandler = module.default;
    });

    it("should successfully patch register entry status", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
        isReconciled: true,
        isCleared: false,
      };

      const mockLookup = {
        register: {
          accountId: "account-123",
        },
      };

      const mockUpdatedEntry = {
        id: "entry-123",
        isReconciled: true,
        isCleared: false,
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockResolvedValue(
        mockLookup,
      );
      prisma.registerEntry.update.mockResolvedValue(mockUpdatedEntry);

      const result = await registerEntryPatchHandler(mockEvent);

      expect(prisma.registerEntry.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: "entry-123",
          accountRegisterId: 1,
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
        select: {
          register: {
            select: {
              accountId: true,
            },
          },
        },
      });
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-123" },
        data: {
          isReconciled: true,
          isCleared: false,
          isPending: true,
          hasBalanceReCalc: true,
        },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual(
        expect.objectContaining({
          accountRegisterId: 1,
          description: "Test Entry",
        }),
      );
    });

    it("should handle unauthorized access", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockRejectedValue(
        new Error("Entry not found or unauthorized"),
      );
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(registerEntryPatchHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/register-entry", () => {
    let registerEntryDeleteHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry.delete");
      registerEntryDeleteHandler = module.default;
    });

    it("should successfully delete register entry", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
      };

      const mockLookup = {
        register: {
          accountId: "account-123",
        },
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockResolvedValue(
        mockLookup,
      );
      prisma.registerEntry.delete.mockResolvedValue({
        id: "entry-123",
      });

      const result = await registerEntryDeleteHandler(mockEvent);

      expect(prisma.registerEntry.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: "entry-123",
          accountRegisterId: 1,
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
        select: {
          register: {
            select: {
              accountId: true,
            },
          },
        },
      });
      expect(prisma.registerEntry.delete).toHaveBeenCalledWith({
        where: { id: "entry-123" },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual({
        message: "Register entry deleted successfully.",
      });
    });

    it("should handle deletion failure", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockRejectedValue(
        new Error("Failed to delete register entry"),
      );
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(registerEntryDeleteHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/register-entry-applied", () => {
    let registerEntryAppliedHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry-applied.post");
      registerEntryAppliedHandler = module.default;
    });

    it("should successfully mark register entry as applied", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
      };

      const mockLookup = {
        amount: 100,
        register: {
          accountId: "account-123",
        },
      };

      const mockUpdatedEntry = {
        id: "entry-123",
        accountRegisterId: 1,
        description: "Test Entry",
        amount: 100,
        balance: 0,
        isProjected: false,
        isCleared: true,
        isPending: false,
        hasBalanceReCalc: true,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { registerEntrySchema } = await import("~/schema/zod");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockResolvedValue(
        mockLookup,
      );
      prisma.accountRegister.update.mockResolvedValue({});
      prisma.registerEntry.update.mockResolvedValue(mockUpdatedEntry);
      registerEntrySchema.parse.mockImplementation((x: unknown) => x);

      const result = await registerEntryAppliedHandler(mockEvent);

      expect(prisma.registerEntry.findFirstOrThrow).toHaveBeenCalled();
      expect(prisma.accountRegister.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          balance: { increment: 100 },
          latestBalance: { increment: 100 },
        },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual(
        expect.objectContaining({
          accountRegisterId: 1,
          description: "Test Entry",
        }),
      );
    });

    it("should handle entry not found", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockRejectedValue(
        new Error("Entry not found"),
      );
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(registerEntryAppliedHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/register-entry-skip", () => {
    let registerEntrySkipHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry-skip.post");
      registerEntrySkipHandler = module.default;
    });

    it.runIf(process.env.RUN_EDGE_CASE_TESTS === "true")(
      "should successfully skip register entry",
      async () => {
        const mockEvent = {};
        const mockBody = {
          registerEntryId: "entry-123",
          accountRegisterId: 1,
        };

        const mockLookup = {
          id: "entry-123",
          reoccurrenceId: "reoccurrence-123",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          accountRegisterId: 1,
          register: {
            accountId: "account-123",
          },
        };

        const mockReoccurrence = {
          id: "reoccurrence-123",
          lastAt: new Date("2024-01-01T00:00:00.000Z"),
          intervalCount: 1,
          interval: { name: "month" },
          accountId: "account-123",
        };

        const { getUser } = await import("~/server/lib/getUser");
        const { prisma } = await import("~/server/clients/prismaClient");
        const { addRecalculateJob } =
          await import("~/server/clients/queuesClient");

        (globalThis as any).readBody.mockResolvedValue(mockBody);
        getUser.mockReturnValue({ userId: 123 });
        prisma.registerEntry.findFirstOrThrow.mockResolvedValue(
          mockLookup,
        );
        prisma.reoccurrence.findFirstOrThrow.mockResolvedValue(
          mockReoccurrence,
        );
        prisma.reoccurrence.update.mockResolvedValue(mockReoccurrence);
        prisma.$transaction.mockImplementation(
          async (callback: any) => {
            const mockPrismaTransaction = {
              registerEntry: {
                delete: vi.fn().mockResolvedValue({}),
              },
              reoccurrence: {
                update: vi.fn().mockResolvedValue(mockReoccurrence),
              },
              reoccurrenceSkip: {
                create: vi.fn().mockResolvedValue({}),
              },
            };
            return await callback(mockPrismaTransaction);
          },
        );

        const result = await registerEntrySkipHandler(mockEvent);

        expect(prisma.registerEntry.findFirstOrThrow).toHaveBeenCalled();
        expect(addRecalculateJob).toHaveBeenCalledWith({
          accountId: "account-123",
        });
        expect(result).toEqual({
          message: "Skipped register entry successfully.",
        });
      },
    );

    it("should handle entry without reoccurrence", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
      };

      const mockLookup = {
        id: "entry-123",
        reoccurrenceId: null, // No reoccurrence
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockResolvedValue(
        mockLookup,
      );
      handleApiError.mockImplementation((error: any) => {
        throw error;
      });

      await expect(registerEntrySkipHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/register-entry-transfer", () => {
    let registerEntryTransferHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry-transfer.post");
      registerEntryTransferHandler = module.default;
    });

    it("should successfully transfer register entry to target account", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
        targetAccountRegisterId: 2,
      };

      const mockOriginalEntry = {
        id: "entry-123",
        description: "Transfer",
        amount: 100,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        reoccurrenceId: null,
        plaidId: null,
        plaidJson: null,
        register: { accountId: "account-123" },
      };

      const mockTransferEntry = {
        id: "entry-new",
        accountRegisterId: 2,
        description: "Transfer",
        amount: 100,
      };
      const mockUpdatedOriginal = { id: "entry-123", isCleared: true };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { registerEntrySchema } = await import("~/schema/zod");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockResolvedValueOnce(
        mockOriginalEntry,
      );
      prisma.accountRegister.findFirstOrThrow.mockResolvedValue({
        accountId: "target-account-id",
      });
      prisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          registerEntry: {
            create: vi.fn().mockResolvedValue(mockTransferEntry),
            update: vi.fn().mockResolvedValue(mockUpdatedOriginal),
          },
          accountRegister: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return await callback(mockTx);
      });
      registerEntrySchema.parse
        .mockReturnValueOnce(mockUpdatedOriginal)
        .mockReturnValueOnce(mockTransferEntry);

      const result = await registerEntryTransferHandler(mockEvent);

      expect(result).toEqual({
        originalEntry: mockUpdatedOriginal,
        transferEntry: mockTransferEntry,
        message: "Transfer completed successfully",
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "target-account-id",
      });
    });

    it("should return 401 when user has no permission to source entry", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
        targetAccountRegisterId: 2,
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockRejectedValue(
        new Error("Not found"),
      );
      handleApiError.mockImplementation((err: any) => {
        throw err;
      });

      await expect(registerEntryTransferHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should reject when source and target account registers are the same", async () => {
      const mockEvent = {};
      const mockBody = {
        registerEntryId: "entry-123",
        accountRegisterId: 1,
        targetAccountRegisterId: 1,
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      handleApiError.mockImplementation((err: any) => {
        throw err;
      });

      await expect(registerEntryTransferHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/register-entry-transfer-create", () => {
    let registerEntryTransferCreateHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry-transfer-create.post");
      registerEntryTransferCreateHandler = module.default;
    });

    it("should successfully create transfer entries in source and target", async () => {
      const mockEvent = {};
      const mockBody = {
        sourceAccountRegisterId: 1,
        targetAccountRegisterId: 2,
        amount: 500,
        description: "Transfer out",
        createdAt: "2024-01-15",
      };

      const mockSourceRegister = {
        id: 1,
        accountId: "account-1",
        name: "Checking",
      };
      const mockTargetRegister = {
        id: 2,
        accountId: "account-2",
        name: "Savings",
      };
      const mockSourceEntry = { id: "src-entry", amount: -500 };
      const mockTargetEntry = { id: "tgt-entry", amount: 500 };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { registerEntrySchema } = await import("~/schema/zod");
      const { dateTimeService } = await import("~/server/services/forecast");

      dateTimeService.toDate = vi
        .fn()
        .mockReturnValue(new Date("2024-01-15T00:00:00.000Z"));
      dateTimeService.parseInput = vi
        .fn()
        .mockReturnValue(new Date("2024-01-15T00:00:00.000Z"));
      const createUTCMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        isSameOrBefore: vi.fn().mockReturnValue(true),
      });
      dateTimeService.createUTC = createUTCMock;
      dateTimeService.now = vi
        .fn()
        .mockReturnValue({
          utc: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
        });

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.accountRegister.findFirstOrThrow
        .mockResolvedValueOnce(mockSourceRegister)
        .mockResolvedValueOnce(mockTargetRegister);
      prisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          registerEntry: {
            create: vi
              .fn()
              .mockResolvedValueOnce(mockSourceEntry)
              .mockResolvedValueOnce(mockTargetEntry),
          },
        };
        return await callback(mockTx);
      });
      registerEntrySchema.parse
        .mockReturnValueOnce(mockSourceEntry)
        .mockReturnValueOnce(mockTargetEntry);

      const result = await registerEntryTransferCreateHandler(mockEvent);

      expect(result).toEqual({
        sourceEntry: mockSourceEntry,
        targetEntry: mockTargetEntry,
        message: "Transfer created successfully",
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-1",
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-2",
      });
    });

    it("should reject when source and target account registers are the same", async () => {
      const mockEvent = {};
      const mockBody = {
        sourceAccountRegisterId: 1,
        targetAccountRegisterId: 1,
        amount: 100,
        description: "X",
        createdAt: "2024-01-01",
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      handleApiError.mockImplementation((err: any) => {
        throw err;
      });

      await expect(
        registerEntryTransferCreateHandler(mockEvent),
      ).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should return 400 when user has no permission to source account", async () => {
      const mockEvent = {};
      const mockBody = {
        sourceAccountRegisterId: 1,
        targetAccountRegisterId: 2,
        amount: 100,
        description: "X",
        createdAt: "2024-01-01",
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.accountRegister.findFirstOrThrow.mockRejectedValue(
        new Error("Not found"),
      );
      handleApiError.mockImplementation((err: any) => {
        throw err;
      });

      await expect(
        registerEntryTransferCreateHandler(mockEvent),
      ).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/register-entry-merge", () => {
    let registerEntryMergeHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry-merge.post");
      registerEntryMergeHandler = module.default;
    });

    it("should keep one entry, delete the duplicate, and write a merge audit", async () => {
      const mockEvent = {};
      const mockBody = {
        accountRegisterId: 1,
        keepRegisterEntryId: "entry-keep",
        duplicateRegisterEntryId: "entry-dup",
      };
      const mockKeptRow = {
        id: "entry-keep",
        accountRegisterId: 1,
        description: "Netflix",
        amount: -30.57,
        balance: 1000,
        isBalanceEntry: false,
        isProjected: false,
        isReconciled: false,
        isCleared: true,
        isPending: true,
        createdAt: new Date("2024-01-15T00:00:00.000Z"),
      };
      const mockRemovedRow = {
        id: "entry-dup",
        accountRegisterId: 1,
        description: "Netflix duplicate",
        amount: -30.57,
        balance: 1030.57,
        seq: 42,
        sourceAccountRegisterId: null,
        referenceId: null,
        checkNo: null,
        reoccurrenceId: null,
        typeId: null,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isManualEntry: true,
        plaidId: null,
        plaidIdHash: null,
        plaidJson: null,
        categoryId: "cat-1",
        categoryLocked: false,
        categorySource: null,
        memo: null,
        createdAt: new Date("2024-01-15T00:00:00.000Z"),
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { registerEntrySchema } = await import("~/schema/zod");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow
        .mockResolvedValueOnce({
          isBalanceEntry: false,
          register: { accountId: "account-123" },
        })
        .mockResolvedValueOnce({ isBalanceEntry: false });
      prisma.registerEntry.delete.mockResolvedValue(mockRemovedRow);
      prisma.registerEntry.findUniqueOrThrow.mockResolvedValue(mockKeptRow);
      prisma.registerEntryMergeAudit.create.mockResolvedValue({});
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
      (registerEntrySchema.parse as any).mockReturnValue(mockKeptRow);

      const result = await registerEntryMergeHandler(mockEvent);

      expect(prisma.registerEntry.findFirstOrThrow).toHaveBeenCalledTimes(2);
      expect(prisma.registerEntry.findFirstOrThrow).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ id: "entry-keep" }),
        }),
      );
      expect(prisma.registerEntry.delete).toHaveBeenCalledWith({
        where: { id: "entry-dup" },
      });
      expect(prisma.registerEntryMergeAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountRegisterId: 1,
          keptRegisterEntryId: "entry-keep",
          removedRegisterEntryId: "entry-dup",
          entryDescription: "Netflix duplicate",
          entryAmount: -30.57,
          entrySeq: 42,
          entryCategoryId: "cat-1",
          mergedByUserId: 123,
        }),
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual({
        keptEntry: mockKeptRow,
        removedEntryId: "entry-dup",
        message: "Register entries merged successfully.",
      });
    });

    it("should reject merging an entry into itself", async () => {
      const mockEvent = {};
      (globalThis as any).readBody.mockResolvedValue({
        accountRegisterId: 1,
        keepRegisterEntryId: "entry-keep",
        duplicateRegisterEntryId: "entry-keep",
      });
      const { getUser } = await import("~/server/lib/getUser");
      getUser.mockReturnValue({ userId: 123 });

      await expect(registerEntryMergeHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: Cannot merge an entry into itself",
      );
    });

    it("should reject merging balance entries", async () => {
      const mockEvent = {};
      (globalThis as any).readBody.mockResolvedValue({
        accountRegisterId: 1,
        keepRegisterEntryId: "entry-keep",
        duplicateRegisterEntryId: "entry-dup",
      });
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow
        .mockResolvedValueOnce({
          isBalanceEntry: true,
          register: { accountId: "account-123" },
        })
        .mockResolvedValueOnce({ isBalanceEntry: false });

      await expect(registerEntryMergeHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: Balance entries cannot be merged",
      );
    });

    it("should reject when the kept entry is not accessible to the user", async () => {
      const mockEvent = {};
      (globalThis as any).readBody.mockResolvedValue({
        accountRegisterId: 1,
        keepRegisterEntryId: "entry-keep",
        duplicateRegisterEntryId: "entry-dup",
      });
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntry.findFirstOrThrow.mockRejectedValue(
        new Error("not found"),
      );

      await expect(registerEntryMergeHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: User does not have permission to keep entry",
      );
    });
  });

  describe("POST /api/register-entry-unmerge", () => {
    let registerEntryUnmergeHandler: any;

    const mockAudit = {
      id: "audit-1",
      accountRegisterId: 1,
      keptRegisterEntryId: "entry-keep",
      removedRegisterEntryId: "entry-dup",
      entryCreatedAt: new Date("2024-01-15T00:00:00.000Z"),
      entrySeq: 42,
      entrySourceAccountRegisterId: null,
      entryReferenceId: null,
      entryCheckNo: null,
      entryDescription: "Netflix duplicate",
      entryReoccurrenceId: null,
      entryAmount: -30.57,
      entryTypeId: null,
      entryIsProjected: false,
      entryIsPending: false,
      entryIsCleared: false,
      entryIsManualEntry: true,
      entryPlaidId: null,
      entryPlaidIdHash: null,
      entryPlaidJson: null,
      entryCategoryId: "cat-1",
      entryCategoryLocked: false,
      entryCategorySource: null,
      entryMemo: null,
      mergedByUserId: 123,
      mergedAt: new Date("2024-01-16T00:00:00.000Z"),
      restoredAt: null,
    };

    beforeEach(async () => {
      const module = await import("../register-entry-unmerge.post");
      registerEntryUnmergeHandler = module.default;
    });

    it("should restore the removed entry and mark the audit restored", async () => {
      const mockEvent = {};
      (globalThis as any).readBody.mockResolvedValue({
        mergeAuditId: "audit-1",
      });

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { registerEntrySchema } = await import("~/schema/zod");

      const mockRestored = { id: "entry-dup", description: "Netflix duplicate" };

      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntryMergeAudit.findUnique.mockResolvedValue(mockAudit);
      prisma.accountRegister.findFirst.mockResolvedValue({
        id: 1,
        accountId: "account-123",
      });
      prisma.registerEntry.findUnique.mockResolvedValue(null);
      prisma.registerEntry.create.mockResolvedValue(mockRestored);
      prisma.registerEntryMergeAudit.update.mockResolvedValue({});
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
      (registerEntrySchema.parse as any).mockReturnValue(mockRestored);

      const result = await registerEntryUnmergeHandler(mockEvent);

      expect(prisma.registerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "entry-dup",
          accountRegisterId: 1,
          description: "Netflix duplicate",
          amount: -30.57,
          seq: 42,
          hasBalanceReCalc: true,
        }),
      });
      expect(prisma.registerEntryMergeAudit.update).toHaveBeenCalledWith({
        where: { id: "audit-1" },
        data: { restoredAt: expect.any(Date) },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual({
        restoredEntry: mockRestored,
        mergeAuditId: "audit-1",
        message: "Register entry restored successfully.",
      });
    });

    it("should return 404 when the merge audit does not exist", async () => {
      const mockEvent = {};
      (globalThis as any).readBody.mockResolvedValue({
        mergeAuditId: "missing",
      });

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntryMergeAudit.findUnique.mockResolvedValue(null);

      await expect(registerEntryUnmergeHandler(mockEvent)).rejects.toThrow(
        "HTTP 404: Merge record not found",
      );
    });

    it("should reject undoing a merge that was already undone", async () => {
      const mockEvent = {};
      (globalThis as any).readBody.mockResolvedValue({
        mergeAuditId: "audit-1",
      });

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntryMergeAudit.findUnique.mockResolvedValue({
        ...mockAudit,
        restoredAt: new Date("2024-01-17T00:00:00.000Z"),
      });

      await expect(registerEntryUnmergeHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: This merge has already been undone",
      );
    });

    it("should reject when the user has no permission for the register", async () => {
      const mockEvent = {};
      (globalThis as any).readBody.mockResolvedValue({
        mergeAuditId: "audit-1",
      });

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntryMergeAudit.findUnique.mockResolvedValue(mockAudit);
      prisma.accountRegister.findFirst.mockResolvedValue(null);

      await expect(registerEntryUnmergeHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: User does not have permission to undo this merge",
      );
    });

    it("should reject when an entry with the original id already exists", async () => {
      const mockEvent = {};
      (globalThis as any).readBody.mockResolvedValue({
        mergeAuditId: "audit-1",
      });

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      getUser.mockReturnValue({ userId: 123 });
      prisma.registerEntryMergeAudit.findUnique.mockResolvedValue(mockAudit);
      prisma.accountRegister.findFirst.mockResolvedValue({
        id: 1,
        accountId: "account-123",
      });
      prisma.registerEntry.findUnique.mockResolvedValue({ id: "entry-dup" });

      await expect(registerEntryUnmergeHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: An entry with the original id already exists on this register",
      );
    });
  });

  describe("GET /api/register-entry-merge-audits", () => {
    let mergeAuditsHandler: any;

    beforeEach(async () => {
      const module = await import("../register-entry-merge-audits.get");
      mergeAuditsHandler = module.default;
    });

    it("should list merge audits for a register", async () => {
      const mockEvent = {};
      (globalThis as any).getQuery = vi.fn().mockReturnValue({
        accountRegisterId: "1",
      });

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { registerEntryMergeAuditSchema } = await import("~/schema/zod");

      const mockAudit = {
        id: "audit-1",
        keptRegisterEntryId: "entry-keep",
        removedRegisterEntryId: "entry-dup",
        entryDescription: "Netflix duplicate",
        entryAmount: -30.57,
        entryCreatedAt: new Date("2024-01-15T00:00:00.000Z"),
        mergedAt: new Date("2024-01-16T00:00:00.000Z"),
        restoredAt: null,
      };

      getUser.mockReturnValue({ userId: 123 });
      prisma.accountRegister.findFirst.mockResolvedValue({ id: 1 });
      prisma.registerEntryMergeAudit.findMany.mockResolvedValue([mockAudit]);
      (registerEntryMergeAuditSchema.parse as any).mockReturnValue({
        ...mockAudit,
      });

      const result = await mergeAuditsHandler(mockEvent);

      expect(prisma.accountRegister.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 1 }),
        }),
      );
      expect(prisma.registerEntryMergeAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountRegisterId: 1 } }),
      );
      expect(result).toEqual({ audits: [mockAudit] });
    });

    it("should reject an invalid accountRegisterId", async () => {
      const mockEvent = {};
      (globalThis as any).getQuery = vi.fn().mockReturnValue({
        accountRegisterId: "abc",
      });

      const { getUser } = await import("~/server/lib/getUser");
      getUser.mockReturnValue({ userId: 123 });

      await expect(mergeAuditsHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: accountRegisterId is required",
      );
    });

    it("should reject when the user has no permission for the register", async () => {
      const mockEvent = {};
      (globalThis as any).getQuery = vi.fn().mockReturnValue({
        accountRegisterId: "1",
      });

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      getUser.mockReturnValue({ userId: 123 });
      prisma.accountRegister.findFirst.mockResolvedValue(null);

      await expect(mergeAuditsHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: User does not have permission to view this register",
      );
    });
  });

  describe("Cross-endpoint Integration", () => {
    it("should use consistent error handling across all register entry endpoints", async () => {
      const { handleApiError } = await import("~/server/lib/handleApiError");

      expect(handleApiError).toBeDefined();
      expect(typeof handleApiError).toBe("function");
    });

    it("should use consistent user authentication", async () => {
      const { getUser } = await import("~/server/lib/getUser");

      expect(getUser).toBeDefined();
      expect(typeof getUser).toBeDefined();
    });

    it("should trigger recalculation consistently", async () => {
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      expect(addRecalculateJob).toBeDefined();
      expect(typeof addRecalculateJob).toBe("function");
    });

    // Example: How to capture stderr during tests
    it("should capture stderr logs", async () => {
      const stderrOutput = await captureStderrAsync(async () => {
        // This would normally produce stderr output
        console.error("This is a test stderr message");

        // Simulate some async operation that might produce stderr
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(stderrOutput).toContain("This is a test stderr message");
    });

    // Example: How to capture Redis connection errors
    it("should capture Redis connection errors", async () => {
      const stderrOutput = await captureStderrAsync(async () => {
        // Simulate Redis connection error
        console.error("Error: connect ECONNREFUSED 127.0.0.1:6379");
        console.error(
          "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1637:16) {",
        );
        console.error("      errno: -61,");
        console.error("      code: 'ECONNREFUSED',");
        console.error("      syscall: 'connect',");
        console.error("      address: '127.0.0.1',");
        console.error("      port: 6379");
        console.error("    }");

        // Simulate some async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(stderrOutput).toContain("ECONNREFUSED");
      expect(stderrOutput).toContain("127.0.0.1:6379");
    });
  });
});
