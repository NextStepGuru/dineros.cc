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
(globalThis as any).getQuery = vi.fn();

// Mock server dependencies
vi.mock("~/server/lib/getPlaidClient", () => ({
  configuration: {
    basePath: "https://sandbox.plaid.com",
    apiKey: {
      clientId: "test-client-id",
      secret: "test-secret",
    },
  },
}));

vi.mock("~/server/lib/plaidWebhook", () => ({
  verifyPlaidWebhook: vi.fn(),
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/clients/queuesClient", () => ({
  addPlaidSyncJob: vi.fn(),
}));

vi.mock("~/server/services/plaidReauthService", () => ({
  markPlaidItemReauthRequired: vi.fn(),
}));

vi.mock("plaid", () => ({
  PlaidApi: vi.fn(),
}));

describe("Plaid Webhook API Endpoints", () => {
  let plaidPostHandler: any;
  let plaidGetHandler: any;
  let mockPlaidClient: any;

  const validBody = JSON.stringify({
    webhook_type: "TRANSACTIONS",
    webhook_code: "SYNC_UPDATES_AVAILABLE",
    item_id: "item-123",
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-create global auto-import mocks after clearAllMocks
    (globalThis as any).getQuery = vi.fn();

    const { readRawBody, getHeader } = await import("h3");
    (readRawBody as any).mockReset();
    (getHeader as any).mockReset();

    mockPlaidClient = { webhookVerificationKeyGet: vi.fn() };
    const { PlaidApi } = await import("plaid");
    (PlaidApi as any).mockImplementation(function () {
      return mockPlaidClient;
    });

    const postModule = await import("../webhook/plaid.post");
    plaidPostHandler = postModule.default;
    const getModule = await import("../webhook/plaid");
    plaidGetHandler = getModule.default;
  });

  async function importWebhookDeps() {
    const { readRawBody, getHeader } = await import("h3");
    const { verifyPlaidWebhook } = await import("~/server/lib/plaidWebhook");
    const { log } = await import("~/server/logger");
    const { addPlaidSyncJob } = await import("~/server/clients/queuesClient");
    const { markPlaidItemReauthRequired } = await import(
      "~/server/services/plaidReauthService"
    );
    return {
      readRawBody,
      getHeader,
      verifyPlaidWebhook,
      log,
      addPlaidSyncJob,
      markPlaidItemReauthRequired,
    };
  }

  describe("POST /api/webhook/plaid", () => {
    it("rejects with 401 when webhook verification fails", async () => {
      const { readRawBody, getHeader, verifyPlaidWebhook, log } =
        await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(validBody);
      (getHeader as any).mockReturnValue("bad-token");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: false });

      let caught: any;
      try {
        await plaidPostHandler({});
      } catch (error) {
        caught = error;
      }

      expect(caught.statusCode).toBe(401);
      expect(caught.message).toContain("Webhook verification failed");
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Plaid webhook verification failed",
          level: "warn",
          data: { hasHeader: true, hasBody: true },
        }),
      );
    });

    it("passes the plaid client, raw body and header to verifyPlaidWebhook", async () => {
      const { readRawBody, getHeader, verifyPlaidWebhook } =
        await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(validBody);
      (getHeader as any).mockReturnValue("jwt-header-value");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });

      await plaidPostHandler({});

      expect(verifyPlaidWebhook).toHaveBeenCalledWith(
        mockPlaidClient,
        validBody,
        "jwt-header-value",
      );
    });

    it("enqueues a sync job for TRANSACTIONS SYNC_UPDATES_AVAILABLE", async () => {
      const { readRawBody, getHeader, verifyPlaidWebhook, addPlaidSyncJob } =
        await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(validBody);
      (getHeader as any).mockReturnValue("jwt");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });

      const result = await plaidPostHandler({});

      expect(result).toEqual({});
      expect(addPlaidSyncJob).toHaveBeenCalledWith(
        { name: "Plaid webhook SYNC_UPDATES_AVAILABLE", itemId: "item-123" },
        { delay: 0 },
      );
    });

    it.each([
      ["DEFAULT_UPDATE"],
      ["INITIAL_UPDATE"],
      ["HISTORICAL_UPDATE"],
    ])("enqueues a sync job for TRANSACTIONS %s", async (webhookCode) => {
      const { readRawBody, getHeader, verifyPlaidWebhook, addPlaidSyncJob } =
        await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(
        JSON.stringify({
          webhook_type: "TRANSACTIONS",
          webhook_code: webhookCode,
          item_id: "item-123",
        }),
      );
      (getHeader as any).mockReturnValue("jwt");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });

      await plaidPostHandler({});

      expect(addPlaidSyncJob).toHaveBeenCalledWith(
        { name: "Plaid webhook SYNC_UPDATES_AVAILABLE", itemId: "item-123" },
        { delay: 0 },
      );
    });

    it("ignores TRANSACTIONS events with untracked webhook codes", async () => {
      const { readRawBody, getHeader, verifyPlaidWebhook, addPlaidSyncJob } =
        await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(
        JSON.stringify({
          webhook_type: "TRANSACTIONS",
          webhook_code: "REMOVED",
          item_id: "item-123",
        }),
      );
      (getHeader as any).mockReturnValue("jwt");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });

      const result = await plaidPostHandler({});

      expect(result).toEqual({});
      expect(addPlaidSyncJob).not.toHaveBeenCalled();
    });

    it("ignores transactions events without an item_id", async () => {
      const { readRawBody, getHeader, verifyPlaidWebhook, addPlaidSyncJob } =
        await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(
        JSON.stringify({
          webhook_type: "TRANSACTIONS",
          webhook_code: "SYNC_UPDATES_AVAILABLE",
        }),
      );
      (getHeader as any).mockReturnValue("jwt");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });

      const result = await plaidPostHandler({});

      expect(result).toEqual({});
      expect(addPlaidSyncJob).not.toHaveBeenCalled();
    });

    it.each(["ERROR", "LOGIN_REQUIRED", "ITEM_LOGIN_REQUIRED"])(
      "marks item re-auth required for ITEM %s",
      async (webhookCode) => {
        const {
          readRawBody,
          getHeader,
          verifyPlaidWebhook,
          addPlaidSyncJob,
          markPlaidItemReauthRequired,
        } = await importWebhookDeps();

        (readRawBody as any).mockResolvedValue(
          JSON.stringify({
            webhook_type: "ITEM",
            webhook_code: webhookCode,
            item_id: "item-err",
          }),
        );
        (getHeader as any).mockReturnValue("jwt");
        (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });
        (markPlaidItemReauthRequired as any).mockResolvedValue(undefined);

        const result = await plaidPostHandler({});

        expect(result).toEqual({});
        expect(markPlaidItemReauthRequired).toHaveBeenCalledWith({
          itemId: "item-err",
          reason: webhookCode,
        });
        expect(addPlaidSyncJob).not.toHaveBeenCalled();
      },
    );

    it("ignores ITEM events with untracked webhook codes", async () => {
      const {
        readRawBody,
        getHeader,
        verifyPlaidWebhook,
        addPlaidSyncJob,
        markPlaidItemReauthRequired,
      } = await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(
        JSON.stringify({
          webhook_type: "ITEM",
          webhook_code: "WEBHOOK_UPDATE_ACKNOWLEDGED",
          item_id: "item-123",
        }),
      );
      (getHeader as any).mockReturnValue("jwt");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });

      const result = await plaidPostHandler({});

      expect(result).toEqual({});
      expect(addPlaidSyncJob).not.toHaveBeenCalled();
      expect(markPlaidItemReauthRequired).not.toHaveBeenCalled();
    });

    it("ignores unknown webhook types", async () => {
      const {
        readRawBody,
        getHeader,
        verifyPlaidWebhook,
        addPlaidSyncJob,
        markPlaidItemReauthRequired,
      } = await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(
        JSON.stringify({
          webhook_type: "AUTH",
          webhook_code: "AUTOMATICALLY_VERIFIED",
          item_id: "item-123",
        }),
      );
      (getHeader as any).mockReturnValue("jwt");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });

      const result = await plaidPostHandler({});

      expect(result).toEqual({});
      expect(addPlaidSyncJob).not.toHaveBeenCalled();
      expect(markPlaidItemReauthRequired).not.toHaveBeenCalled();
    });

    it("handles an empty verified body without routing", async () => {
      const { readRawBody, getHeader, verifyPlaidWebhook, addPlaidSyncJob } =
        await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(null);
      (getHeader as any).mockReturnValue("jwt");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });

      const result = await plaidPostHandler({});

      expect(result).toEqual({});
      expect(addPlaidSyncJob).not.toHaveBeenCalled();
    });

    it("returns 503 when the sync job cannot be enqueued", async () => {
      const {
        readRawBody,
        getHeader,
        verifyPlaidWebhook,
        addPlaidSyncJob,
        log,
        markPlaidItemReauthRequired,
      } = await importWebhookDeps();

      (readRawBody as any).mockResolvedValue(validBody);
      (getHeader as any).mockReturnValue("jwt");
      (verifyPlaidWebhook as any).mockResolvedValue({ valid: true });
      (addPlaidSyncJob as any).mockRejectedValue(new Error("Redis down"));

      let caught: any;
      try {
        await plaidPostHandler({});
      } catch (error) {
        caught = error;
      }

      expect(caught.statusCode).toBe(503);
      expect(caught.message).toContain("Queue unavailable");
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Failed to enqueue Plaid webhook sync job",
          level: "error",
        }),
      );
      expect(markPlaidItemReauthRequired).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/webhook/plaid (debug logger)", () => {
    it("logs the query and returns an empty object", async () => {
      const { log } = await import("~/server/logger");
      const mockEvent = {};
      const mockQuery = { webhook_type: "TRANSACTIONS" };
      (globalThis as any).getQuery.mockReturnValue(mockQuery);

      const result = await plaidGetHandler(mockEvent);

      expect(result).toEqual({});
      expect((globalThis as any).getQuery).toHaveBeenCalledWith(mockEvent);
      expect(log).toHaveBeenCalledWith({
        message: "Query:",
        data: mockQuery,
        level: "info",
      });
    });
  });
});
