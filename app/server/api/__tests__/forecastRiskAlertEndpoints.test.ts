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
}));

// Make H3 functions globally available
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();
(globalThis as any).getRouterParam = vi.fn();

// Mock server dependencies
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

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    toISOString: vi.fn(() => "2026-10-02T00:00:00.000Z"),
  },
}));

vi.mock("~/server/services/notificationCenterService", () => ({
  syncNotificationsForBudget: vi.fn(),
  getNotificationSnapshot: vi.fn(),
  dismissNotification: vi.fn(),
  migrateLegacyForecastDismissals: vi.fn(),
}));

vi.mock("~/server/services/forecastRiskAlertService", () => ({
  evaluateForecastRiskAlerts: vi.fn(),
}));

const riskAlert = {
  key: "11:negative_balance:2026-10-10",
  notificationId: 101,
};

describe("Forecast Risk Alert API Endpoints", () => {
  let getUser: any;
  let handleApiError: any;
  let syncNotificationsForBudget: any;
  let getNotificationSnapshot: any;
  let dismissNotification: any;
  let evaluateForecastRiskAlerts: any;
  let log: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-create the global h3 shims after clearing mocks
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
    (globalThis as any).getRouterParam = vi.fn();

    ({ getUser } = await import("~/server/lib/getUser"));
    ({ handleApiError } = await import("~/server/lib/handleApiError"));
    ({
      syncNotificationsForBudget,
      getNotificationSnapshot,
      dismissNotification,
    } = await import("~/server/services/notificationCenterService"));
    ({ evaluateForecastRiskAlerts } = await import(
      "~/server/services/forecastRiskAlertService"
    ));
    ({ log } = await import("~/server/logger"));

    getUser.mockReturnValue({ userId: 1 });
    syncNotificationsForBudget.mockResolvedValue(undefined);
    getNotificationSnapshot.mockResolvedValue({
      riskAlerts: [riskAlert],
      recurringHealthIssues: [],
      billAlerts: [],
      reconciliationAlerts: [],
      total: 1,
    });
    dismissNotification.mockResolvedValue(undefined);
    evaluateForecastRiskAlerts.mockResolvedValue({
      evaluatedAt: "2026-10-02T00:00:00.000Z",
      daysAhead: 45,
      alerts: [riskAlert],
    });
  });

  describe("GET /api/forecast-risk-alerts", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../forecast-risk-alerts.get");
      handler = module.default;
    });

    it("syncs then returns the risk alerts with the default 90-day horizon", async () => {
      (globalThis as any).getQuery.mockReturnValue({ budgetId: 7 });

      const result = await handler({});

      expect(result).toEqual({
        evaluatedAt: "2026-10-02T00:00:00.000Z",
        daysAhead: 90,
        alerts: [riskAlert],
      });
      expect(syncNotificationsForBudget).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        daysAhead: 90,
      });
      expect(getNotificationSnapshot).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
      });
    });

    it("honors a custom daysAhead from the query", async () => {
      (globalThis as any).getQuery.mockReturnValue({
        budgetId: "7",
        daysAhead: "15",
      });

      const result = await handler({});

      expect(result.daysAhead).toBe(15);
      expect(syncNotificationsForBudget).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        daysAhead: 15,
      });
    });

    it("rejects invalid queries and reports to handleApiError", async () => {
      (globalThis as any).getQuery.mockReturnValue({});

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(getNotificationSnapshot).not.toHaveBeenCalled();
    });

    it("propagates service failures through handleApiError", async () => {
      (globalThis as any).getQuery.mockReturnValue({ budgetId: 7 });
      const boom = new Error("snapshot failed");
      getNotificationSnapshot.mockRejectedValue(boom);

      await expect(handler({})).rejects.toThrow("snapshot failed");
      expect(handleApiError).toHaveBeenCalledWith(boom);
    });
  });

  describe("POST /api/forecast-risk-alerts/evaluate", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../forecast-risk-alerts/evaluate.post");
      handler = module.default;
    });

    it("evaluates alerts for the requested horizon and logs the result", async () => {
      (globalThis as any).readBody.mockResolvedValue({
        budgetId: 7,
        daysAhead: 45,
      });

      const result = await handler({});

      expect(result).toEqual({
        evaluatedAt: "2026-10-02T00:00:00.000Z",
        daysAhead: 45,
        alerts: [riskAlert],
      });
      expect(evaluateForecastRiskAlerts).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        daysAhead: 45,
      });
      expect(log).toHaveBeenCalledWith({
        message: "Forecast risk alerts evaluated",
        data: {
          userId: 1,
          budgetId: 7,
          daysAhead: 45,
          alertCount: 1,
        },
      });
    });

    it("defaults to a 90-day horizon when daysAhead is omitted", async () => {
      (globalThis as any).readBody.mockResolvedValue({ budgetId: 7 });

      await handler({});

      expect(evaluateForecastRiskAlerts).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        daysAhead: 90,
      });
    });

    it("rejects invalid bodies and reports to handleApiError", async () => {
      (globalThis as any).readBody.mockResolvedValue({});

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(evaluateForecastRiskAlerts).not.toHaveBeenCalled();
    });

    it("propagates service failures through handleApiError", async () => {
      (globalThis as any).readBody.mockResolvedValue({ budgetId: 7 });
      const denied = new Error("HTTP 403: Budget not found or access denied");
      (denied as any).statusCode = 403;
      evaluateForecastRiskAlerts.mockRejectedValue(denied);

      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
      expect(handleApiError).toHaveBeenCalledWith(denied);
    });
  });

  describe("PATCH /api/forecast-risk-alerts/state", () => {
    let handler: any;
    let prisma: any;

    beforeEach(async () => {
      const module = await import("../forecast-risk-alerts/state.patch");
      handler = module.default;
      ({ prisma } = await import("~/server/clients/prismaClient"));
    });

    it("dismisses the matching forecast-risk event and returns the refreshed alerts", async () => {
      (globalThis as any).readBody.mockResolvedValue({
        key: "11:negative_balance:2026-10-10",
        status: "dismissed",
      });
      (globalThis as any).getQuery.mockReturnValue({ budgetId: "7" });
      prisma.notificationEvent.findFirst.mockResolvedValue({ id: 101 });

      const result = await handler({});

      expect(syncNotificationsForBudget).toHaveBeenCalledTimes(2);
      expect(syncNotificationsForBudget).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
      });
      expect(prisma.notificationEvent.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 1,
          budgetId: 7,
          kind: "FORECAST_RISK",
          occurrenceKey: "11:negative_balance:2026-10-10",
          isActive: true,
        },
        select: { id: true },
      });
      expect(dismissNotification).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        notificationId: 101,
      });
      expect(getNotificationSnapshot).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
      });
      expect(result).toEqual({ alerts: [riskAlert] });
    });

    it("still re-syncs and returns alerts when no matching event exists", async () => {
      (globalThis as any).readBody.mockResolvedValue({
        key: "missing-key",
        status: "dismissed",
      });
      (globalThis as any).getQuery.mockReturnValue({ budgetId: "7" });
      prisma.notificationEvent.findFirst.mockResolvedValue(null);

      const result = await handler({});

      expect(syncNotificationsForBudget).toHaveBeenCalledTimes(2);
      expect(dismissNotification).not.toHaveBeenCalled();
      expect(result).toEqual({ alerts: [riskAlert] });
    });

    it("is a no-op when the query has no budgetId", async () => {
      (globalThis as any).readBody.mockResolvedValue({
        key: "k",
        status: "resolved",
      });
      (globalThis as any).getQuery.mockReturnValue({});

      const result = await handler({});

      expect(result).toEqual({ ok: true });
      expect(syncNotificationsForBudget).not.toHaveBeenCalled();
      expect(prisma.notificationEvent.findFirst).not.toHaveBeenCalled();
      expect(dismissNotification).not.toHaveBeenCalled();
      expect(getNotificationSnapshot).not.toHaveBeenCalled();
    });

    it("rejects invalid bodies and reports to handleApiError", async () => {
      (globalThis as any).readBody.mockResolvedValue({ status: "dismissed" });
      (globalThis as any).getQuery.mockReturnValue({ budgetId: 7 });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(syncNotificationsForBudget).not.toHaveBeenCalled();
    });

    it("propagates service failures through handleApiError", async () => {
      (globalThis as any).readBody.mockResolvedValue({
        key: "k",
        status: "dismissed",
      });
      (globalThis as any).getQuery.mockReturnValue({ budgetId: "7" });
      const boom = new Error("sync failed");
      syncNotificationsForBudget.mockRejectedValue(boom);

      await expect(handler({})).rejects.toThrow("sync failed");
      expect(handleApiError).toHaveBeenCalledWith(boom);
    });
  });
});
