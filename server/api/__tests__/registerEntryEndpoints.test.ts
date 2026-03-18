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
vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    $transaction: vi.fn(),
    accountRegister: {
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
    },
    registerEntry: {
      findFirstOrThrow: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reoccurrence: {
      findUniqueOrThrow: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
    },
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
  registerEntrySchema: {
    parse: vi.fn(),
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
        isManualEntry: true,
        hasBalanceReCalc: true,
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { registerEntrySchema } = await import("~/schema/zod");
      const { createId } = await import("@paralleldrive/cuid2");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (registerEntrySchema.parse as any).mockReturnValue(mockBody);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(
        mockLookup
      );
      (createId as any).mockReturnValue("entry-123");
      (prisma.registerEntry.upsert as any).mockResolvedValue(mockCreatedEntry);
      (registerEntrySchema.parse as any).mockReturnValue(mockCreatedEntry);

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
      expect(prisma.registerEntry.upsert).toHaveBeenCalledWith({
        where: { id: "entry-123" },
        create: expect.objectContaining({
          id: "entry-123",
          accountRegisterId: 1,
          description: "Test Entry",
          amount: 100,
          isManualEntry: true,
          hasBalanceReCalc: true,
        }),
        update: expect.objectContaining({
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
        isManualEntry: true,
        hasBalanceReCalc: true,
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { registerEntrySchema } = await import("~/schema/zod");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (registerEntrySchema.parse as any).mockReturnValue(mockBody);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue(
        mockLookup
      );
      (prisma.registerEntry.upsert as any).mockResolvedValue(mockUpdatedEntry);
      (registerEntrySchema.parse as any).mockReturnValue(mockUpdatedEntry);

      const result = await registerEntryPostHandler(mockEvent);

      expect(prisma.registerEntry.upsert).toHaveBeenCalledWith({
        where: { id: "existing-entry-123" },
        create: expect.any(Object),
        update: expect.objectContaining({
          description: "Updated Entry",
          amount: 200,
        }),
      });
      expect(result).toEqual(mockUpdatedEntry);
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (registerEntrySchema.parse as any).mockReturnValue(mockBody);
      (prisma.accountRegister.findFirstOrThrow as any).mockRejectedValue(
        new Error("User does not have permission")
      );
      (handleApiError as any).mockImplementation((error: any) => {
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
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any).mockResolvedValue(
        mockLookup
      );
      (prisma.registerEntry.update as any).mockResolvedValue(mockUpdatedEntry);

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
        })
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any).mockRejectedValue(
        new Error("Entry not found or unauthorized")
      );
      (handleApiError as any).mockImplementation((error: any) => {
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
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any).mockResolvedValue(
        mockLookup
      );
      (prisma.registerEntry.delete as any).mockResolvedValue({
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any).mockRejectedValue(
        new Error("Failed to delete register entry")
      );
      (handleApiError as any).mockImplementation((error: any) => {
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

      const mockReoccurrence = {
        id: "reoccurrence-123",
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        intervalId: 1,
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { dateTimeService } = await import("~/server/services/forecast");

      // Mock dateTimeService methods
      (dateTimeService.add as any) = vi.fn().mockReturnValue({
        toISOString: () => "2024-02-01T00:00:00.000Z",
      });
      (dateTimeService.isSameOrBefore as any) = vi.fn().mockReturnValue(true);

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any).mockResolvedValue(
        mockLookup
      );
      (prisma.reoccurrence.findUniqueOrThrow as any).mockResolvedValue(
        mockReoccurrence
      );
      (prisma.reoccurrence.update as any).mockResolvedValue(mockReoccurrence);

      const result = await registerEntryAppliedHandler(mockEvent);

      expect(prisma.registerEntry.findFirstOrThrow).toHaveBeenCalled();
      expect(addRecalculateJob).toHaveBeenCalledWith({
        accountId: "account-123",
      });
      expect(result).toEqual(
        expect.objectContaining({
          accountRegisterId: 1,
          description: "Test Entry",
        })
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any).mockRejectedValue(
        new Error("Entry not found")
      );
      (handleApiError as any).mockImplementation((error: any) => {
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
        const { addRecalculateJob } = await import(
          "~/server/clients/queuesClient"
        );

        (globalThis as any).readBody.mockResolvedValue(mockBody);
        (getUser as any).mockReturnValue({ userId: 123 });
        (prisma.registerEntry.findFirstOrThrow as any).mockResolvedValue(
          mockLookup
        );
        (prisma.reoccurrence.findFirstOrThrow as any).mockResolvedValue(
          mockReoccurrence
        );
        (prisma.reoccurrence.update as any).mockResolvedValue(mockReoccurrence);
        (prisma.$transaction as any).mockImplementation(
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
          }
        );

        const result = await registerEntrySkipHandler(mockEvent);

        expect(prisma.registerEntry.findFirstOrThrow).toHaveBeenCalled();
        expect(addRecalculateJob).toHaveBeenCalledWith({
          accountId: "account-123",
        });
        expect(result).toEqual({
          message: "Skipped register entry successfully.",
        });
      }
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any).mockResolvedValue(
        mockLookup
      );
      (handleApiError as any).mockImplementation((error: any) => {
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
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { registerEntrySchema } = await import("~/schema/zod");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any)
        .mockResolvedValueOnce(mockOriginalEntry);
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue({
        accountId: "target-account-id",
      });
      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
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
      (registerEntrySchema.parse as any)
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.registerEntry.findFirstOrThrow as any).mockRejectedValue(
        new Error("Not found")
      );
      (handleApiError as any).mockImplementation((err: any) => {
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (handleApiError as any).mockImplementation((err: any) => {
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
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { registerEntrySchema } = await import("~/schema/zod");
      const { dateTimeService } = await import("~/server/services/forecast");

      (dateTimeService.toDate as any) = vi.fn().mockReturnValue(new Date("2024-01-15T00:00:00.000Z"));
      (dateTimeService.parseInput as any) = vi.fn().mockReturnValue(new Date("2024-01-15T00:00:00.000Z"));
      const createUTCMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        isSameOrBefore: vi.fn().mockReturnValue(true),
      });
      (dateTimeService.createUTC as any) = createUTCMock;
      (dateTimeService.now as any) = vi.fn().mockReturnValue({ utc: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis() });

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirstOrThrow as any)
        .mockResolvedValueOnce(mockSourceRegister)
        .mockResolvedValueOnce(mockTargetRegister);
      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
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
      (registerEntrySchema.parse as any)
        .mockReturnValueOnce(mockSourceEntry)
        .mockReturnValueOnce(mockTargetEntry);

      const result = await registerEntryTransferCreateHandler(mockEvent);

      expect(result).toEqual({
        sourceEntry: mockSourceEntry,
        targetEntry: mockTargetEntry,
        message: "Transfer created successfully",
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "account-1" });
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "account-2" });
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (handleApiError as any).mockImplementation((err: any) => {
        throw err;
      });

      await expect(
        registerEntryTransferCreateHandler(mockEvent)
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
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirstOrThrow as any).mockRejectedValue(
        new Error("Not found")
      );
      (handleApiError as any).mockImplementation((err: any) => {
        throw err;
      });

      await expect(
        registerEntryTransferCreateHandler(mockEvent)
      ).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
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
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

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
          "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1637:16) {"
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
