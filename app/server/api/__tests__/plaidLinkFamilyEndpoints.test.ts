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
  getRouterParam: vi.fn(),
  readRawBody: vi.fn(),
  getHeader: vi.fn(),
}));

// Make H3 functions globally available (auto-imported by Nuxt server routes)
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/getPlaidClient", () => ({
  configuration: {
    basePath: "https://sandbox.plaid.com",
    apiKey: {
      clientId: "test-client-id",
      secret: "test-secret",
    },
  },
}));

vi.mock("plaid", () => ({
  PlaidApi: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/schema/zod", () => ({
  privateUserSchema: { parse: vi.fn() },
  publicProfileSchema: { parse: vi.fn() },
}));

vi.mock("~/server/clients/postmarkClient", () => ({
  postmarkClient: { sendEmail: vi.fn() },
  hasPostmarkToken: true,
}));

vi.mock("~/server/clients/queuesClient", () => ({
  addPlaidSyncJob: vi.fn(),
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/lib/plaidUserAccess", () => ({
  plaidIsActiveForUser: vi.fn(),
}));

// plaid-link-accounts imports the forecast barrel only for dateTimeService.
// Mock the barrel so the forecast engine is never loaded.
vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    now: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
    nowDate: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
    toISOString: vi.fn(() => "2024-01-01T00:00:00.000Z"),
  },
}));

vi.mock("~/server/env", () => ({
  default: {
    DB_ENCRYPTION_KEY:
      "k1.aesgcm256.yQcdOV0BPCyRNiFasjXX5kqelCifs2jpp70GbLrao4c=",
    DEPLOY_ENV: "local",
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import {
  encryptPlaidAccessTokenForSettings,
  resolvePlaidAccessTokenFromStored,
} from "~/server/lib/plaidAccessTokenCrypto";

const FIXED_DATE = new Date("2024-01-01T00:00:00.000Z");
const RAW_ACCESS_TOKEN = "access-sandbox-token";
const ENCRYPTED_ACCESS_TOKEN =
  encryptPlaidAccessTokenForSettings(RAW_ACCESS_TOKEN);

// Full shape required by the real plaidAccountSchema (schema/plaid.ts)
const checkingPlaidAccount = {
  id: "plaid-checking-1",
  mask: "0000",
  name: "Plaid Checking",
  type: "checking",
  subtype: "checking",
  class_type: null,
  verification_status: null,
};

const savingsPlaidAccount = {
  id: "plaid-savings-2",
  mask: "1111",
  name: "Plaid Savings",
  type: "savings",
  subtype: "savings",
  class_type: null,
  verification_status: null,
};

describe("Plaid Link Family API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-create global auto-import mocks after clearAllMocks
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
  });

  describe("POST /api/plaid-link", () => {
    let plaidLinkPostHandler: any;
    let mockPlaidClient: any;

    beforeEach(async () => {
      mockPlaidClient = { itemPublicTokenExchange: vi.fn() };
      const { PlaidApi } = await import("plaid");
      (PlaidApi as any).mockImplementation(function () {
        return mockPlaidClient;
      });

      const { getUser } = await import("~/server/lib/getUser");
      const { privateUserSchema, publicProfileSchema } = await import(
        "~/schema/zod"
      );
      const { prisma } = await import("~/server/clients/prismaClient");

      (getUser as any).mockReset().mockReturnValue({ userId: 123 });
      (privateUserSchema.parse as any)
        .mockReset()
        .mockImplementation((u: any) => u);
      (publicProfileSchema.parse as any)
        .mockReset()
        .mockImplementation((u: any) => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
        }));
      (prisma.user.findUniqueOrThrow as any)
        .mockReset()
        .mockResolvedValue({ id: 123, email: "user@test.cc" });
      (prisma.user.update as any)
        .mockReset()
        .mockResolvedValue({
          id: 123,
          email: "user@test.cc",
          firstName: "Pepe",
        });
      (prisma.plaidItem.upsert as any).mockReset().mockResolvedValue({});
      mockPlaidClient.itemPublicTokenExchange
        .mockReset()
        .mockResolvedValue({
          data: {
            item_id: "item-abc",
            access_token: RAW_ACCESS_TOKEN,
            request_id: "req-1",
          },
        });

      const module = await import("../plaid-link.post");
      plaidLinkPostHandler = module.default;
    });

    it("exchanges the public token, stores an encrypted access token, enqueues a sync and sends the email", async () => {
      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addPlaidSyncJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );

      const mockBody = {
        public_token: "public-sandbox-token",
        metadata: {
          institution: { name: "Chase", institution_id: "ins_1" },
        },
      };
      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (readBody as any).mockResolvedValue(mockBody);
      (postmarkClient.sendEmail as any).mockResolvedValue({ MessageID: "m1" });

      const result = await plaidLinkPostHandler({});

      expect(result).toEqual({ id: 123, email: "user@test.cc", firstName: "Pepe" });
      expect(mockPlaidClient.itemPublicTokenExchange).toHaveBeenCalledWith({
        public_token: "public-sandbox-token",
      });
      expect(prisma.plaidItem.upsert).toHaveBeenCalledWith({
        where: { itemId: "item-abc" },
        create: { itemId: "item-abc", userId: 123 },
        update: { userId: 123, updatedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const updateArg = (prisma.user.update as any).mock.calls[0][0];
      const storedToken = updateArg.data.settings.plaid.access_token;
      expect(storedToken).not.toBe(RAW_ACCESS_TOKEN);
      expect(resolvePlaidAccessTokenFromStored(storedToken)).toBe(
        RAW_ACCESS_TOKEN,
      );
      expect(updateArg.data.settings.plaid.isEnabled).toBe(true);
      expect(updateArg.where).toEqual({ id: 123 });
      expect(addPlaidSyncJob).toHaveBeenCalledWith(
        { name: "Initial Plaid sync after link", itemId: "item-abc" },
        { delay: 0 },
      );
      expect(postmarkClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: "Mr. Pepe Dineros <pepe@dineros.cc>",
          To: "user@test.cc",
          Subject:
            "You have successfully connected your bank account(s) to Dineros!",
        }),
      );
    });

    it("rejects when the public token is missing", async () => {
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (globalThis as any).readBody.mockResolvedValue({});
      (readBody as any).mockResolvedValue({});

      await expect(plaidLinkPostHandler({})).rejects.toThrow(
        "Public token is required",
      );
      expect(handleApiError).toHaveBeenCalled();
      expect(mockPlaidClient.itemPublicTokenExchange).not.toHaveBeenCalled();
    });

    it("returns 503 when the initial sync job cannot be enqueued", async () => {
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { addPlaidSyncJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );

      (globalThis as any).readBody.mockResolvedValue({
        public_token: "public-sandbox-token",
      });
      (readBody as any).mockResolvedValue({
        public_token: "public-sandbox-token",
      });
      (addPlaidSyncJob as any).mockRejectedValue(new Error("Redis down"));

      let caught: any;
      try {
        await plaidLinkPostHandler({});
      } catch (error) {
        caught = error;
      }

      expect(caught.statusCode).toBe(503);
      expect(caught.message).toContain("Queue unavailable");
      expect(handleApiError).toHaveBeenCalled();
      expect(postmarkClient.sendEmail).not.toHaveBeenCalled();
    });

    it("propagates exchange errors through handleApiError", async () => {
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const exchangeError = new Error("INVALID_PUBLIC_TOKEN");
      mockPlaidClient.itemPublicTokenExchange.mockRejectedValue(exchangeError);
      (globalThis as any).readBody.mockResolvedValue({
        public_token: "public-sandbox-token",
      });
      (readBody as any).mockResolvedValue({
        public_token: "public-sandbox-token",
      });

      await expect(plaidLinkPostHandler({})).rejects.toThrow(
        "INVALID_PUBLIC_TOKEN",
      );
      expect(handleApiError).toHaveBeenCalledWith(exchangeError);
    });

    it("skips the upsert and sync job when the exchange returns no item_id", async () => {
      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addPlaidSyncJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );

      mockPlaidClient.itemPublicTokenExchange.mockResolvedValue({
        data: { access_token: RAW_ACCESS_TOKEN },
      });
      (globalThis as any).readBody.mockResolvedValue({
        public_token: "public-sandbox-token",
      });
      (readBody as any).mockResolvedValue({
        public_token: "public-sandbox-token",
      });
      (postmarkClient.sendEmail as any).mockResolvedValue({ MessageID: "m1" });

      const result = await plaidLinkPostHandler({});

      expect(result).toEqual({ id: 123, email: "user@test.cc", firstName: "Pepe" });
      expect(prisma.plaidItem.upsert).not.toHaveBeenCalled();
      expect(addPlaidSyncJob).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(postmarkClient.sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/plaid-link-accounts", () => {
    let plaidLinkAccountsHandler: any;

    const settingsUser = {
      id: 123,
      email: "user@test.cc",
      firstName: "Pepe",
      settings: {
        plaid: {
          isEnabled: false,
          access_token: ENCRYPTED_ACCESS_TOKEN,
          metadata: {
            accounts: [checkingPlaidAccount, savingsPlaidAccount],
          },
        },
      },
    };

    beforeEach(async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { privateUserSchema, publicProfileSchema } = await import(
        "~/schema/zod"
      );
      const { prisma } = await import("~/server/clients/prismaClient");

      (getUser as any).mockReset().mockReturnValue({ userId: 123 });
      (privateUserSchema.parse as any)
        .mockReset()
        .mockReturnValue(settingsUser);
      (publicProfileSchema.parse as any)
        .mockReset()
        .mockImplementation((u: any) => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
        }));
      (prisma.user.findUniqueOrThrow as any)
        .mockReset()
        .mockResolvedValue({ id: 123 });
      (prisma.user.findFirstOrThrow as any)
        .mockReset()
        .mockResolvedValue({ id: 123 });
      (prisma.user.update as any)
        .mockReset()
        .mockResolvedValue({
          id: 123,
          email: "user@test.cc",
          firstName: "Pepe",
        });
      (prisma.accountRegister.findMany as any).mockReset().mockResolvedValue([]);
      (prisma.accountRegister.create as any).mockReset().mockResolvedValue({});
      (prisma.accountRegister.update as any).mockReset().mockResolvedValue({});
      (prisma.account.findFirstOrThrow as any)
        .mockReset()
        .mockResolvedValue({ id: "acc-1" });
      (prisma.budget.findFirstOrThrow as any)
        .mockReset()
        .mockResolvedValue({ id: 55 });

      const module = await import("../plaid-link-accounts.post");
      plaidLinkAccountsHandler = module.default;
    });

    it("creates a new account register for a linkAccount with accountRegisterId 0", async () => {
      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      const mockBody = {
        linkAccounts: [{ accountRegisterId: 0, plaidId: "plaid-checking-1" }],
      };
      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (readBody as any).mockResolvedValue(mockBody);

      const result = await plaidLinkAccountsHandler({});

      expect(result).toEqual({
        id: 123,
        email: "user@test.cc",
        firstName: "Pepe",
      });
      expect(prisma.accountRegister.findMany).not.toHaveBeenCalled();
      expect(prisma.accountRegister.create).toHaveBeenCalledTimes(1);
      expect(prisma.accountRegister.create).toHaveBeenCalledWith({
        data: {
          plaidId: "plaid-checking-1",
          plaidJson: {
            accessToken: RAW_ACCESS_TOKEN,
            plaidAccount: checkingPlaidAccount,
          },
          plaidAccessToken: RAW_ACCESS_TOKEN,
          name: "Plaid Checking",
          balance: 0,
          statementAt: FIXED_DATE,
          budget: { connect: { id: 55 } },
          type: { connect: { id: 1 } },
          account: { connect: { id: "acc-1" } },
        },
      });
      expect(prisma.accountRegister.update).not.toHaveBeenCalled();

      const updateArg = (prisma.user.update as any).mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 123 });
      expect(updateArg.data.settings.plaid.isEnabled).toBe(true);
      expect(updateArg.data.settings.plaid.metadata).toBeDefined();
    });

    it("updates an existing account register when accountRegisterId is set", async () => {
      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      const mockBody = {
        linkAccounts: [{ accountRegisterId: 7, plaidId: "plaid-checking-1" }],
      };
      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (readBody as any).mockResolvedValue(mockBody);
      (prisma.accountRegister.findMany as any).mockResolvedValue([{ id: 7 }]);

      const result = await plaidLinkAccountsHandler({});

      expect(result).toEqual({
        id: 123,
        email: "user@test.cc",
        firstName: "Pepe",
      });
      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [7] },
          account: {
            userAccounts: {
              some: { userId: 123 },
            },
          },
        },
      });
      expect(prisma.accountRegister.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          plaidId: "plaid-checking-1",
          plaidJson: {
            accessToken: RAW_ACCESS_TOKEN,
            plaidAccount: checkingPlaidAccount,
          },
          plaidAccessToken: RAW_ACCESS_TOKEN,
        },
      });
      expect(prisma.accountRegister.create).not.toHaveBeenCalled();
    });

    it("rejects when the user lacks permission for the requested registers", async () => {
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { prisma } = await import("~/server/clients/prismaClient");

      const mockBody = {
        linkAccounts: [{ accountRegisterId: 7, plaidId: "plaid-checking-1" }],
      };
      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (readBody as any).mockResolvedValue(mockBody);
      (prisma.accountRegister.findMany as any).mockResolvedValue([]);

      await expect(plaidLinkAccountsHandler({})).rejects.toThrow(
        "You don't have permission to link these accounts.",
      );
      expect(handleApiError).toHaveBeenCalled();
      expect(prisma.user.findFirstOrThrow).not.toHaveBeenCalled();
      expect(prisma.accountRegister.create).not.toHaveBeenCalled();
      expect(prisma.accountRegister.update).not.toHaveBeenCalled();
    });

    it("falls back to defaults when the plaidId is not present in stored metadata", async () => {
      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      const mockBody = {
        linkAccounts: [{ accountRegisterId: 0, plaidId: "plaid-unknown" }],
      };
      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (readBody as any).mockResolvedValue(mockBody);

      await plaidLinkAccountsHandler({});

      expect(prisma.accountRegister.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plaidId: "plaid-unknown",
          plaidJson: {
            accessToken: RAW_ACCESS_TOKEN,
            plaidAccount: {},
          },
          plaidAccessToken: RAW_ACCESS_TOKEN,
          name: "Plaid Account Import",
          type: { connect: { id: 16 } },
        }),
      });
    });

    it("rejects invalid bodies through the zod schema and handleApiError", async () => {
      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).readBody.mockResolvedValue({});
      (readBody as any).mockResolvedValue({});

      await expect(plaidLinkAccountsHandler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
      expect(prisma.accountRegister.create).not.toHaveBeenCalled();
      expect(prisma.accountRegister.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/plaid-list-accounts", () => {
    let plaidListAccountsHandler: any;

    beforeEach(async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { privateUserSchema } = await import("~/schema/zod");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { plaidIsActiveForUser } = await import(
        "~/server/lib/plaidUserAccess"
      );

      (getUser as any).mockReset().mockReturnValue({ userId: 123 });
      (privateUserSchema.parse as any)
        .mockReset()
        .mockReturnValue({
          id: 123,
          settings: {
            plaid: {
              isEnabled: true,
              metadata: { accounts: [checkingPlaidAccount, savingsPlaidAccount] },
            },
          },
        });
      (prisma.user.findUniqueOrThrow as any)
        .mockReset()
        .mockResolvedValue({ id: 123 });
      (prisma.accountRegister.findMany as any)
        .mockReset()
        .mockResolvedValue([{ plaidId: "plaid-checking-1" }]);
      (plaidIsActiveForUser as any).mockReset().mockResolvedValue(true);

      const module = await import("../plaid-list-accounts");
      plaidListAccountsHandler = module.default;
    });

    it("returns stored plaid accounts that have not been synced yet", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      const result = await plaidListAccountsHandler({});

      expect(result).toEqual({ accounts: [savingsPlaidAccount] });
      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith({
        where: {
          account: {
            userAccounts: {
              some: { userId: 123 },
            },
          },
          plaidId: { not: null },
        },
        select: { plaidId: true },
      });
    });

    it("rejects when plaid is not active for the user", async () => {
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { plaidIsActiveForUser } = await import(
        "~/server/lib/plaidUserAccess"
      );

      (plaidIsActiveForUser as any).mockResolvedValue(false);

      await expect(plaidListAccountsHandler({})).rejects.toThrow(
        "Plaid is not enabled for this user.",
      );
      expect(handleApiError).toHaveBeenCalled();
      expect(prisma.accountRegister.findMany).not.toHaveBeenCalled();
    });

    it("returns an empty list when there is no stored account metadata", async () => {
      const { privateUserSchema } = await import("~/schema/zod");
      (privateUserSchema.parse as any).mockReturnValue({
        id: 123,
        settings: { plaid: { isEnabled: true } },
      });

      const result = await plaidListAccountsHandler({});

      expect(result).toEqual({ accounts: [] });
    });

    it("routes lookup errors through handleApiError", async () => {
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { prisma } = await import("~/server/clients/prismaClient");

      const lookupError = new Error("user missing");
      (prisma.user.findUniqueOrThrow as any).mockRejectedValue(lookupError);

      await expect(plaidListAccountsHandler({})).rejects.toThrow(
        "user missing",
      );
      expect(handleApiError).toHaveBeenCalledWith(lookupError);
    });
  });

  describe("GET /api/plaid-synced-accounts", () => {
    let plaidSyncedAccountsHandler: any;

    const syncedRegister = {
      id: 1,
      name: "Plaid Checking",
      plaidId: "plaid-checking-1",
      plaidLastSyncAt: FIXED_DATE,
      plaidBalanceLastSyncAt: FIXED_DATE,
      balance: 100,
      type: { name: "Checking", isCredit: false },
    };

    beforeEach(async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { privateUserSchema } = await import("~/schema/zod");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { plaidIsActiveForUser } = await import(
        "~/server/lib/plaidUserAccess"
      );

      (getUser as any).mockReset().mockReturnValue({ userId: 123 });
      (privateUserSchema.parse as any)
        .mockReset()
        .mockReturnValue({
          id: 123,
          settings: {
            plaid: {
              isEnabled: true,
              metadata: { accounts: [checkingPlaidAccount, savingsPlaidAccount] },
            },
          },
        });
      (prisma.user.findUniqueOrThrow as any)
        .mockReset()
        .mockResolvedValue({ id: 123 });
      (prisma.accountRegister.findMany as any)
        .mockReset()
        .mockResolvedValue([syncedRegister]);
      (plaidIsActiveForUser as any).mockReset().mockResolvedValue(true);

      const module = await import("../plaid-synced-accounts.get");
      plaidSyncedAccountsHandler = module.default;
    });

    it("returns synced registers with their plaid metadata when plaid is enabled", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      const result = await plaidSyncedAccountsHandler({});

      expect(result).toEqual({
        accounts: [{ ...syncedRegister, plaidAccount: checkingPlaidAccount }],
      });
      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith({
        where: {
          account: {
            userAccounts: {
              some: { userId: 123 },
            },
          },
          plaidId: { not: null },
          isArchived: false,
        },
        select: {
          id: true,
          name: true,
          plaidId: true,
          plaidLastSyncAt: true,
          plaidBalanceLastSyncAt: true,
          balance: true,
          type: { select: { name: true, isCredit: true } },
        },
      });
    });

    it("returns registers without metadata when plaid is disabled", async () => {
      const { plaidIsActiveForUser } = await import(
        "~/server/lib/plaidUserAccess"
      );
      (plaidIsActiveForUser as any).mockResolvedValue(false);

      const result = await plaidSyncedAccountsHandler({});

      expect(result).toEqual({
        accounts: [{ ...syncedRegister, plaidAccount: undefined }],
      });
    });

    it("routes errors through handleApiError", async () => {
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { prisma } = await import("~/server/clients/prismaClient");

      const findError = new Error("query failed");
      (prisma.accountRegister.findMany as any).mockRejectedValue(findError);

      await expect(plaidSyncedAccountsHandler({})).rejects.toThrow(
        "query failed",
      );
      expect(handleApiError).toHaveBeenCalledWith(findError);
    });
  });
});
