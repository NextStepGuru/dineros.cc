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

vi.mock("~/server/services/notificationCenterService", () => ({
  syncNotificationsForBudget: vi.fn(),
  getNotificationSnapshot: vi.fn(),
  dismissNotification: vi.fn(),
  migrateLegacyForecastDismissals: vi.fn(),
}));

const snapshotFixture = {
  riskAlerts: [{ key: "k1", notificationId: 101 }],
  recurringHealthIssues: [],
  billAlerts: [],
  reconciliationAlerts: [],
  total: 1,
};

describe("Notification API Endpoints", () => {
  let getUser: any;
  let handleApiError: any;
  let syncNotificationsForBudget: any;
  let getNotificationSnapshot: any;
  let dismissNotification: any;

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

    getUser.mockReturnValue({ userId: 1 });
    syncNotificationsForBudget.mockResolvedValue(undefined);
    getNotificationSnapshot.mockResolvedValue(snapshotFixture);
    dismissNotification.mockResolvedValue(undefined);
  });

  describe("GET /api/notifications", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../notifications.get");
      handler = module.default;
    });

    it("syncs then returns the snapshot with ok statuses", async () => {
      (globalThis as any).getQuery.mockReturnValue({
        budgetId: 7,
        daysAhead: 90,
      });

      const result = await handler({});

      expect(result).toEqual({
        ...snapshotFixture,
        riskStatus: "ok",
        recurringStatus: "ok",
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

    it("coerces query strings and honors a custom daysAhead", async () => {
      (globalThis as any).getQuery.mockReturnValue({
        budgetId: "7",
        daysAhead: "30",
      });

      await handler({});

      expect(syncNotificationsForBudget).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        daysAhead: 30,
      });
    });

    it("rejects invalid queries and reports to handleApiError", async () => {
      (globalThis as any).getQuery.mockReturnValue({});

      await expect(handler({})).rejects.toThrow();
      expect(syncNotificationsForBudget).not.toHaveBeenCalled();
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("propagates service failures through handleApiError", async () => {
      (globalThis as any).getQuery.mockReturnValue({ budgetId: 7 });
      const boom = new Error("sync failed");
      syncNotificationsForBudget.mockRejectedValue(boom);

      await expect(handler({})).rejects.toThrow("sync failed");
      expect(handleApiError).toHaveBeenCalledWith(boom);
    });
  });

  describe("GET /api/notifications/count", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../notifications/count.get");
      handler = module.default;
    });

    it("returns the snapshot total as the count", async () => {
      (globalThis as any).getQuery.mockReturnValue({ budgetId: 7 });

      const result = await handler({});

      expect(result).toEqual({ count: 1 });
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

    it("rejects invalid queries and reports to handleApiError", async () => {
      (globalThis as any).getQuery.mockReturnValue({ budgetId: "not-a-number" });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(getNotificationSnapshot).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/notifications/[id]/dismiss", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../notifications/[id]/dismiss.patch");
      handler = module.default;
    });

    it("dismisses by id, re-syncs, and returns the fresh snapshot", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("42");
      (globalThis as any).readBody.mockResolvedValue({
        budgetId: 7,
        status: "dismissed",
      });

      const result = await handler({});

      expect(result).toEqual(snapshotFixture);
      expect(dismissNotification).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        notificationId: 42,
      });
      expect(syncNotificationsForBudget).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
      });
      expect(getNotificationSnapshot).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
      });
    });

    it("rejects non-numeric ids with 400 without touching the service", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("abc");
      (globalThis as any).readBody.mockResolvedValue({ budgetId: 7 });

      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
      expect(dismissNotification).not.toHaveBeenCalled();
    });

    it("rejects ids below one with 400", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("0");
      (globalThis as any).readBody.mockResolvedValue({ budgetId: 7 });

      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
      expect(dismissNotification).not.toHaveBeenCalled();
    });

    it("rejects a body without budgetId and reports to handleApiError", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("42");
      (globalThis as any).readBody.mockResolvedValue({ status: "dismissed" });

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(dismissNotification).not.toHaveBeenCalled();
    });

    it("propagates service failures through handleApiError", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("42");
      (globalThis as any).readBody.mockResolvedValue({ budgetId: 7 });
      const notFound = new Error("HTTP 404: Notification not found");
      (notFound as any).statusCode = 404;
      dismissNotification.mockRejectedValue(notFound);

      await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
      expect(handleApiError).toHaveBeenCalledWith(notFound);
    });
  });
});
