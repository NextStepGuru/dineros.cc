import { beforeEach, describe, expect, it, vi } from "vitest";

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
  readMultipartFormData: vi.fn(),
  setResponseStatus: vi.fn(),
  getRouterParam: vi.fn(),
  getRequestURL: vi.fn(),
}));

// Make H3 functions globally available (Nuxt auto-imports them bare)
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/services/reconciliationService", () => ({
  getReconciliationSetup: vi.fn(),
  openReconciliationPeriod: vi.fn(),
  getReconciliationPeriodWorkspace: vi.fn(),
  updateReconciliationPeriodBalances: vi.fn(),
  closeReconciliationPeriod: vi.fn(),
  importStatementLinesToLedger: vi.fn(),
  rematchReconciliationPeriod: vi.fn(),
  getOpenReconciliationPeriodSummaries: vi.fn(),
  updateStatementLine: vi.fn(),
  updateReconciliationItem: vi.fn(),
}));

vi.mock("~/server/services/statementExtractService", () => ({
  extractStatementFromUpload: vi.fn(),
}));

const MOCK_USER = { userId: 123, jwtKey: "key-123", iat: 1, exp: 2 };

function eventWithParams(params: Record<string, string> = {}) {
  return { context: { params } } as any;
}

function unauthorizedUserError() {
  const err = new Error("HTTP 401: User not found in context") as any;
  err.statusCode = 401;
  err.statusMessage = "User not found in context";
  return err;
}

describe("Reconciliation API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-create globalThis auto-import fns after clearAllMocks
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
  });

  describe("GET /api/reconciliation/period", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../reconciliation/period.get");
      handler = module.default;
    });

    it("returns the reconciliation setup for coerced query params", async () => {
      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { getReconciliationSetup } = await import(
        "~/server/services/reconciliationService",
      );
      const setup = { register: { id: 11 }, period: null };
      const query = { budgetId: "7", accountRegisterId: "11" };

      (getQuery as any).mockReturnValue(query);
      (globalThis as any).getQuery.mockReturnValue(query);
      (getUser as any).mockReturnValue(MOCK_USER);
      (getReconciliationSetup as any).mockResolvedValue(setup);

      const mockEvent = {};
      const result = await handler(mockEvent);

      expect(result).toBe(setup);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(getReconciliationSetup).toHaveBeenCalledWith({
        userId: 123,
        budgetId: 7,
        accountRegisterId: 11,
      });
    });

    it("rejects with 401 when the user is missing from context", async () => {
      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const query = { budgetId: "7", accountRegisterId: "11" };

      (getQuery as any).mockReturnValue(query);
      (globalThis as any).getQuery.mockReturnValue(query);
      (getUser as any).mockImplementation(() => {
        throw unauthorizedUserError();
      });

      await expect(handler({})).rejects.toMatchObject({ statusCode: 401 });
      expect(handleApiError).toHaveBeenCalled();
    });

    it("rejects when the query is missing required ids", async () => {
      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue({ budgetId: "7" });
      (globalThis as any).getQuery.mockReturnValue({ budgetId: "7" });
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
      const { getReconciliationSetup } = await import(
        "~/server/services/reconciliationService",
      );
      expect(getReconciliationSetup).not.toHaveBeenCalled();
    });

    it("propagates service errors through handleApiError", async () => {
      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { getReconciliationSetup } = await import(
        "~/server/services/reconciliationService",
      );
      const query = { budgetId: "7", accountRegisterId: "11" };

      (getQuery as any).mockReturnValue(query);
      (globalThis as any).getQuery.mockReturnValue(query);
      (getUser as any).mockReturnValue(MOCK_USER);
      const dbError = new Error("Database operation failed");
      (getReconciliationSetup as any).mockRejectedValue(dbError);

      await expect(handler({})).rejects.toThrow("Database operation failed");
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });
  });

  describe("POST /api/reconciliation/period", () => {
    let handler: any;

    beforeEach(async () => {
      (globalThis as any).readBody = vi.fn();
      const module = await import("../reconciliation/period.post");
      handler = module.default;
    });

    it("opens a period with the mapped body including statement lines", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { openReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );
      const body = {
        budgetId: "7",
        accountRegisterId: 11,
        startDate: "2024-06-01",
        endDate: "2024-06-30",
        statementOpeningBalance: "1000",
        statementEndingBalance: "1100",
        statementIncomeTotal: "200",
        statementExpenseTotal: "-100",
        statementLines: [
          {
            date: "2024-06-05",
            description: "STARBUCKS",
            amount: "-5.25",
            lineType: "POS",
          },
          {
            date: "2024-06-06",
            description: "GROCERY",
            amount: -45.1,
          },
        ],
      };
      const created = { id: 501 };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);
      (openReconciliationPeriod as any).mockResolvedValue(created);

      const result = await handler({});

      expect(result).toBe(created);
      expect(openReconciliationPeriod).toHaveBeenCalledWith({
        userId: 123,
        budgetId: 7,
        accountRegisterId: 11,
        startDate: "2024-06-01",
        endDate: "2024-06-30",
        statementOpeningBalance: 1000,
        statementEndingBalance: 1100,
        statementIncomeTotal: 200,
        statementExpenseTotal: -100,
        statementLines: [
          {
            date: "2024-06-05",
            description: "STARBUCKS",
            amount: -5.25,
            lineType: "POS",
          },
          {
            date: "2024-06-06",
            description: "GROCERY",
            amount: -45.1,
            lineType: null,
          },
        ],
      });
    });

    it("applies schema defaults when optional fields are absent", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { openReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );
      const body = {
        budgetId: 7,
        accountRegisterId: 11,
        startDate: "2024-06-01",
        endDate: "2024-06-30",
        statementEndingBalance: 1100,
      };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);
      (openReconciliationPeriod as any).mockResolvedValue({ id: 501 });

      await handler({});

      expect(openReconciliationPeriod).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 123,
          statementOpeningBalance: 0,
          statementIncomeTotal: undefined,
          statementExpenseTotal: undefined,
          statementLines: undefined,
        }),
      );
    });

    it("rejects a body missing the required ending balance", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { openReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );
      const body = { budgetId: 7, accountRegisterId: 11 };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
      expect(openReconciliationPeriod).not.toHaveBeenCalled();
    });

    it("propagates service rejections", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { openReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );
      const body = {
        budgetId: 7,
        accountRegisterId: 11,
        startDate: "2024-06-01",
        endDate: "2024-06-30",
        statementEndingBalance: 1100,
      };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);
      const serviceError = new Error("Register not found");
      (openReconciliationPeriod as any).mockRejectedValue(serviceError);

      await expect(handler({})).rejects.toThrow("Register not found");
      expect(handleApiError).toHaveBeenCalledWith(serviceError);
    });
  });

  describe("GET /api/reconciliation/period/[id]", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../reconciliation/period/[id].get");
      handler = module.default;
    });

    it("returns the workspace for the coerced period id", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { getReconciliationPeriodWorkspace } = await import(
        "~/server/services/reconciliationService",
      );
      const workspace = { period: { id: 501 }, lines: [] };
      const mockEvent = eventWithParams({ id: "501" });

      (getUser as any).mockReturnValue(MOCK_USER);
      (getReconciliationPeriodWorkspace as any).mockResolvedValue(workspace);

      const result = await handler(mockEvent);

      expect(result).toBe(workspace);
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(getReconciliationPeriodWorkspace).toHaveBeenCalledWith({
        userId: 123,
        periodId: 501,
      });
    });

    it("rejects a non-numeric period id", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { getReconciliationPeriodWorkspace } = await import(
        "~/server/services/reconciliationService",
      );

      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(
        handler(eventWithParams({ id: "not-a-number" })),
      ).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
      expect(getReconciliationPeriodWorkspace).not.toHaveBeenCalled();
    });

    it("rejects when params are missing", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(handler(eventWithParams())).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("PATCH /api/reconciliation/period/[id]", () => {
    let handler: any;

    beforeEach(async () => {
      (globalThis as any).readBody = vi.fn();
      const module = await import("../reconciliation/period/[id].patch");
      handler = module.default;
    });

    it("updates balances with coerced numbers", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { updateReconciliationPeriodBalances } = await import(
        "~/server/services/reconciliationService",
      );
      const body = {
        statementOpeningBalance: "1000.50",
        statementEndingBalance: "1100",
      };
      const updated = { id: 501, statementEndingBalance: 1100 };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);
      (updateReconciliationPeriodBalances as any).mockResolvedValue(updated);

      const result = await handler(eventWithParams({ id: "501" }));

      expect(result).toBe(updated);
      expect(updateReconciliationPeriodBalances).toHaveBeenCalledWith({
        userId: 123,
        periodId: 501,
        statementOpeningBalance: 1000.5,
        statementEndingBalance: 1100,
      });
    });

    it("rejects a non-positive period id", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const body = {
        statementOpeningBalance: 1000,
        statementEndingBalance: 1100,
      };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(handler(eventWithParams({ id: "0" }))).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("rejects a body missing the required balances", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue({ statementEndingBalance: 1100 });
      (globalThis as any).readBody.mockResolvedValue({
        statementEndingBalance: 1100,
      });
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(handler(eventWithParams({ id: "501" }))).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/reconciliation/period/[id]/close", () => {
    let handler: any;

    beforeEach(async () => {
      (globalThis as any).readBody = vi.fn();
      const module = await import("../reconciliation/period/[id]/close.post");
      handler = module.default;
    });

    it("closes the period with the provided note", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { closeReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );
      const body = { closeNote: "All cleared" };
      const closed = { id: 501, status: "CLOSED" };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);
      (closeReconciliationPeriod as any).mockResolvedValue(closed);

      const result = await handler(eventWithParams({ id: "501" }));

      expect(result).toBe(closed);
      expect(closeReconciliationPeriod).toHaveBeenCalledWith({
        userId: 123,
        periodId: 501,
        closeNote: "All cleared",
      });
    });

    it("passes an undefined closeNote for an empty body", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { closeReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );

      (readBody as any).mockResolvedValue({});
      (globalThis as any).readBody.mockResolvedValue({});
      (getUser as any).mockReturnValue(MOCK_USER);
      (closeReconciliationPeriod as any).mockResolvedValue({ id: 501 });

      await handler(eventWithParams({ id: "501" }));

      expect(closeReconciliationPeriod).toHaveBeenCalledWith({
        userId: 123,
        periodId: 501,
        closeNote: undefined,
      });
    });

    it("propagates service rejections", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { closeReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );

      (readBody as any).mockResolvedValue({ closeNote: null });
      (globalThis as any).readBody.mockResolvedValue({ closeNote: null });
      (getUser as any).mockReturnValue(MOCK_USER);
      const serviceError = new Error("Period not balanced");
      (closeReconciliationPeriod as any).mockRejectedValue(serviceError);

      await expect(
        handler(eventWithParams({ id: "501" })),
      ).rejects.toThrow("Period not balanced");
      expect(handleApiError).toHaveBeenCalledWith(serviceError);
    });
  });

  describe("POST /api/reconciliation/period/[id]/import-statement-lines", () => {
    let handler: any;

    beforeEach(async () => {
      (globalThis as any).readBody = vi.fn();
      const module = await import(
        "../reconciliation/period/[id]/import-statement-lines.post",
      );
      handler = module.default;
    });

    it("imports coerced statement line ids", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { importStatementLinesToLedger } = await import(
        "~/server/services/reconciliationService",
      );
      const body = { statementLineIds: ["7001", 7002] };
      const imported = { importedCount: 2 };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);
      (importStatementLinesToLedger as any).mockResolvedValue(imported);

      const result = await handler(eventWithParams({ id: "501" }));

      expect(result).toBe(imported);
      expect(importStatementLinesToLedger).toHaveBeenCalledWith({
        userId: 123,
        periodId: 501,
        statementLineIds: [7001, 7002],
      });
    });

    it("passes undefined statementLineIds when the body is null", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { importStatementLinesToLedger } = await import(
        "~/server/services/reconciliationService",
      );

      (readBody as any).mockResolvedValue(null);
      (globalThis as any).readBody.mockResolvedValue(null);
      (getUser as any).mockReturnValue(MOCK_USER);
      (importStatementLinesToLedger as any).mockResolvedValue({
        importedCount: 0,
      });

      await handler(eventWithParams({ id: "501" }));

      expect(importStatementLinesToLedger).toHaveBeenCalledWith({
        userId: 123,
        periodId: 501,
        statementLineIds: undefined,
      });
    });

    it("rejects non-positive statement line ids", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { importStatementLinesToLedger } = await import(
        "~/server/services/reconciliationService",
      );
      const body = { statementLineIds: [0] };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(
        handler(eventWithParams({ id: "501" })),
      ).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
      expect(importStatementLinesToLedger).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/reconciliation/period/[id]/match", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../reconciliation/period/[id]/match.post");
      handler = module.default;
    });

    it("rematches the period and returns the service result", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { rematchReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );
      const summary = { matched: 4, conflicts: 1, statementOnly: 2 };

      (getUser as any).mockReturnValue(MOCK_USER);
      (rematchReconciliationPeriod as any).mockResolvedValue(summary);

      const result = await handler(eventWithParams({ id: "501" }));

      expect(result).toBe(summary);
      expect(rematchReconciliationPeriod).toHaveBeenCalledWith({
        userId: 123,
        periodId: 501,
      });
    });

    it("rejects a non-numeric period id", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { rematchReconciliationPeriod } = await import(
        "~/server/services/reconciliationService",
      );

      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(
        handler(eventWithParams({ id: "abc" })),
      ).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
      expect(rematchReconciliationPeriod).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/reconciliation/periods/open", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../reconciliation/periods/open.get");
      handler = module.default;
    });

    it("returns open period summaries for the budget", async () => {
      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { getOpenReconciliationPeriodSummaries } = await import(
        "~/server/services/reconciliationService",
      );
      const summaries = [{ id: 501, status: "OPEN" }];
      const query = { budgetId: "7" };

      (getQuery as any).mockReturnValue(query);
      (globalThis as any).getQuery.mockReturnValue(query);
      (getUser as any).mockReturnValue(MOCK_USER);
      (getOpenReconciliationPeriodSummaries as any).mockResolvedValue(summaries);

      const result = await handler({});

      expect(result).toBe(summaries);
      expect(getOpenReconciliationPeriodSummaries).toHaveBeenCalledWith({
        userId: 123,
        budgetId: 7,
      });
    });

    it("rejects an invalid budget id", async () => {
      const { getQuery } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getQuery as any).mockReturnValue({ budgetId: "-3" });
      (globalThis as any).getQuery.mockReturnValue({ budgetId: "-3" });
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("PATCH /api/reconciliation/statement-line/[id]", () => {
    let handler: any;

    beforeEach(async () => {
      (globalThis as any).readBody = vi.fn();
      const module = await import("../reconciliation/statement-line/[id].patch");
      handler = module.default;
    });

    it("updates the statement line with the body fields", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { updateStatementLine } = await import(
        "~/server/services/reconciliationService",
      );
      const body = {
        ignore: true,
        registerEntryId: "e-123",
        createLedgerEntry: false,
      };
      const updated = { id: 7001, ignore: true };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);
      (updateStatementLine as any).mockResolvedValue(updated);

      const result = await handler(eventWithParams({ id: "7001" }));

      expect(result).toBe(updated);
      expect(updateStatementLine).toHaveBeenCalledWith({
        userId: 123,
        statementLineId: 7001,
        ignore: true,
        registerEntryId: "e-123",
        createLedgerEntry: false,
      });
    });

    it("passes undefined fields for an empty body", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { updateStatementLine } = await import(
        "~/server/services/reconciliationService",
      );

      (readBody as any).mockResolvedValue({});
      (globalThis as any).readBody.mockResolvedValue({});
      (getUser as any).mockReturnValue(MOCK_USER);
      (updateStatementLine as any).mockResolvedValue({ id: 7001 });

      await handler(eventWithParams({ id: "7001" }));

      expect(updateStatementLine).toHaveBeenCalledWith({
        userId: 123,
        statementLineId: 7001,
        ignore: undefined,
        registerEntryId: undefined,
        createLedgerEntry: undefined,
      });
    });

    it("rejects an empty registerEntryId", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { updateStatementLine } = await import(
        "~/server/services/reconciliationService",
      );
      const body = { registerEntryId: "" };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(
        handler(eventWithParams({ id: "7001" })),
      ).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
      expect(updateStatementLine).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/reconciliation/item/[entryId]", () => {
    let handler: any;

    beforeEach(async () => {
      (globalThis as any).readBody = vi.fn();
      const module = await import("../reconciliation/item/[entryId].patch");
      handler = module.default;
    });

    it("updates the reconciliation item with params and body", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { updateReconciliationItem } = await import(
        "~/server/services/reconciliationService",
      );
      const body = {
        isCleared: true,
        note: "Matches coffee",
        categoryId: "cat-9",
      };
      const updated = { id: 9001, isCleared: true };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);
      (updateReconciliationItem as any).mockResolvedValue(updated);

      const result = await handler(eventWithParams({ entryId: "e-777" }));

      expect(result).toBe(updated);
      expect(updateReconciliationItem).toHaveBeenCalledWith({
        userId: 123,
        registerEntryId: "e-777",
        isCleared: true,
        note: "Matches coffee",
        categoryId: "cat-9",
      });
    });

    it("passes undefined optional fields when the body is empty", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { updateReconciliationItem } = await import(
        "~/server/services/reconciliationService",
      );

      (readBody as any).mockResolvedValue({});
      (globalThis as any).readBody.mockResolvedValue({});
      (getUser as any).mockReturnValue(MOCK_USER);
      (updateReconciliationItem as any).mockResolvedValue({ id: 9001 });

      await handler(eventWithParams({ entryId: "e-777" }));

      expect(updateReconciliationItem).toHaveBeenCalledWith({
        userId: 123,
        registerEntryId: "e-777",
        isCleared: undefined,
        note: undefined,
        categoryId: undefined,
      });
    });

    it("rejects a note longer than 500 characters", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { updateReconciliationItem } = await import(
        "~/server/services/reconciliationService",
      );
      const body = { note: "x".repeat(501) };

      (readBody as any).mockResolvedValue(body);
      (globalThis as any).readBody.mockResolvedValue(body);
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(
        handler(eventWithParams({ entryId: "e-777" })),
      ).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
      expect(updateReconciliationItem).not.toHaveBeenCalled();
    });

    it("rejects when the entryId param is missing", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue({ isCleared: true });
      (globalThis as any).readBody.mockResolvedValue({ isCleared: true });
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(handler(eventWithParams())).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });

  describe("POST /api/reconciliation/statement/extract", () => {
    let handler: any;
    let readMultipartFormData: any;

    beforeEach(async () => {
      const h3 = await import("h3");
      readMultipartFormData = h3.readMultipartFormData;
      const module = await import("../reconciliation/statement/extract.post");
      handler = module.default;
    });

    it("extracts an uploaded statement via the extract service", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { extractStatementFromUpload } = await import(
        "~/server/services/statementExtractService",
      );
      const { prisma } = await import("~/server/clients/prismaClient");
      const fileData = Buffer.from("Date,Amount\n2024-06-01,-5.00");
      const parts = [
        { name: "accountRegisterId", data: Buffer.from("11") },
        {
          name: "file",
          data: fileData,
          filename: "statement.csv",
        },
      ];
      const extracted = { source: "csv", lines: [] };

      readMultipartFormData.mockResolvedValue(parts);
      (getUser as any).mockReturnValue(MOCK_USER);
      (prisma.accountRegister.findFirst as any).mockResolvedValue({ id: 11 });
      (extractStatementFromUpload as any).mockResolvedValue(extracted);

      const result = await handler({});

      expect(result).toBe(extracted);
      expect(prisma.accountRegister.findFirst).toHaveBeenCalledWith({
        where: {
          id: 11,
          account: { userAccounts: { some: { userId: 123 } } },
        },
        select: { id: true },
      });
      expect(extractStatementFromUpload).toHaveBeenCalledWith({
        filename: "statement.csv",
        buffer: expect.any(Buffer),
        userId: 123,
      });
      const args = (extractStatementFromUpload as any).mock.calls[0][0];
      expect(args.buffer.toString("utf8")).toBe(fileData.toString("utf8"));
    });

    it("returns 400 when no multipart parts are provided", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const { extractStatementFromUpload } = await import(
        "~/server/services/statementExtractService",
      );

      readMultipartFormData.mockResolvedValue(null);
      (getUser as any).mockReturnValue(MOCK_USER);

      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
      expect(handleApiError).toHaveBeenCalled();
      expect(extractStatementFromUpload).not.toHaveBeenCalled();
    });

    it("returns 400 when the file part is missing", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const parts = [
        { name: "accountRegisterId", data: Buffer.from("11") },
      ];

      readMultipartFormData.mockResolvedValue(parts);
      (getUser as any).mockReturnValue(MOCK_USER);
      const { prisma } = await import("~/server/clients/prismaClient");
      (prisma.accountRegister.findFirst as any).mockResolvedValue({ id: 11 });

      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
      const { extractStatementFromUpload } = await import(
        "~/server/services/statementExtractService",
      );
      expect(extractStatementFromUpload).not.toHaveBeenCalled();
    });

    it("returns 404 when the register is not found for the user", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const parts = [
        { name: "accountRegisterId", data: Buffer.from("99") },
        { name: "file", data: Buffer.from("data"), filename: "s.csv" },
      ];

      readMultipartFormData.mockResolvedValue(parts);
      (getUser as any).mockReturnValue(MOCK_USER);
      (prisma.accountRegister.findFirst as any).mockResolvedValue(null);

      await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns 413 when the file exceeds the 8MB limit", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const parts = [
        { name: "accountRegisterId", data: Buffer.from("11") },
        {
          name: "file",
          data: Buffer.alloc(8_000_001, 97),
          filename: "big.pdf",
        },
      ];

      readMultipartFormData.mockResolvedValue(parts);
      (getUser as any).mockReturnValue(MOCK_USER);
      (prisma.accountRegister.findFirst as any).mockResolvedValue({ id: 11 });

      await expect(handler({})).rejects.toMatchObject({ statusCode: 413 });
    });

    it("defaults the filename to statement.pdf when none is provided", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { extractStatementFromUpload } = await import(
        "~/server/services/statementExtractService",
      );
      const { prisma } = await import("~/server/clients/prismaClient");
      const parts = [
        { name: "accountRegisterId", data: Buffer.from("11") },
        { name: "file", data: Buffer.from("%PDF-1.4") },
      ];

      readMultipartFormData.mockResolvedValue(parts);
      (getUser as any).mockReturnValue(MOCK_USER);
      (prisma.accountRegister.findFirst as any).mockResolvedValue({ id: 11 });
      (extractStatementFromUpload as any).mockResolvedValue({ source: "pdf" });

      await handler({});

      expect(extractStatementFromUpload).toHaveBeenCalledWith({
        filename: "statement.pdf",
        buffer: expect.any(Buffer),
        userId: 123,
      });
    });

    it("rejects with 401 when the user is missing from context", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      readMultipartFormData.mockResolvedValue([
        { name: "file", data: Buffer.from("x"), filename: "s.csv" },
      ]);
      (getUser as any).mockImplementation(() => {
        throw unauthorizedUserError();
      });

      await expect(handler({})).rejects.toMatchObject({ statusCode: 401 });
      expect(handleApiError).toHaveBeenCalled();
    });
  });
});
