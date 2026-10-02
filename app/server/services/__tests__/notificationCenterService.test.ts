import { beforeEach, describe, expect, it, vi } from "vitest";

import * as notificationCenterService from "../notificationCenterService";

const NOW = new Date("2026-10-02T00:00:00.000Z");

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    toDate: vi.fn(() => NOW),
    toISOString: vi.fn((input: Date) => input.toISOString()),
  },
}));

vi.mock("~/server/services/forecastRiskAlertService", () => ({
  evaluateForecastRiskAlerts: vi.fn(),
}));

vi.mock("~/server/services/reoccurrenceHealthService", () => ({
  getReoccurrenceHealth: vi.fn(),
}));

vi.mock("~/server/services/billCenterService", () => ({
  getBillCenterSnapshot: vi.fn(),
}));

vi.mock("~/server/services/reconciliationService", () => ({
  getOpenReconciliationPeriodSummaries: vi.fn(),
}));

let prisma: any;
let evaluateForecastRiskAlerts: any;
let getReoccurrenceHealth: any;
let getBillCenterSnapshot: any;
let getOpenReconciliationPeriodSummaries: any;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ prisma } = await import("~/server/clients/prismaClient"));
  ({
    evaluateForecastRiskAlerts,
  } = await import("~/server/services/forecastRiskAlertService"));
  ({
    getReoccurrenceHealth,
  } = await import("~/server/services/reoccurrenceHealthService"));
  ({
    getBillCenterSnapshot,
  } = await import("~/server/services/billCenterService"));
  ({
    getOpenReconciliationPeriodSummaries,
  } = await import("~/server/services/reconciliationService"));

  // Default access check passes; individual tests override.
  prisma.budget.findFirst.mockResolvedValue({ id: 7 });
  evaluateForecastRiskAlerts.mockResolvedValue({ alerts: [] });
  getReoccurrenceHealth.mockResolvedValue({ issues: [] });
  getBillCenterSnapshot.mockResolvedValue({ items: [], counts: {} });
  getOpenReconciliationPeriodSummaries.mockResolvedValue([]);
});

function riskAlertFixture(overrides: Record<string, unknown> = {}) {
  return {
    key: "11:negative_balance:2026-10-10",
    accountRegisterId: 11,
    accountRegisterName: "Checking",
    riskType: "negative_balance" as const,
    threshold: 0,
    projectedBalanceAtRisk: -50,
    projectedLowestBalance: -50,
    riskAt: "2026-10-10T00:00:00.000Z",
    daysUntilRisk: 8,
    ...overrides,
  };
}

function recurringIssueFixture(overrides: Record<string, unknown> = {}) {
  return {
    type: "duplicate_rule" as const,
    reoccurrenceId: 5,
    description: "Rent",
    accountRegisterId: 11,
    accountRegisterName: "Checking",
    details: "Duplicate rule detected",
    occurrenceKey: "dup-5",
    ...overrides,
  };
}

function riskPayloadFixture(overrides: Record<string, unknown> = {}) {
  const alert = riskAlertFixture(overrides) as Record<string, unknown>;
  return {
    key: alert.key,
    accountRegisterId: alert.accountRegisterId,
    accountRegisterName: alert.accountRegisterName,
    riskType: alert.riskType,
    threshold: alert.threshold,
    projectedBalanceAtRisk: alert.projectedBalanceAtRisk,
    projectedLowestBalance: alert.projectedLowestBalance,
    riskAt: alert.riskAt,
    daysUntilRisk: alert.daysUntilRisk,
  };
}

describe("notificationCenterService", () => {
  describe("migrateLegacyForecastDismissals", () => {
    it("marks the user as migrated without a transaction when there are no legacy items", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 501,
        settings: {},
      });

      await notificationCenterService.migrateLegacyForecastDismissals({
        userId: 501,
        budgetId: 7,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 501 },
        select: { settings: true },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.notificationDismissal.upsert).not.toHaveBeenCalled();
    });

    it("creates forecast-risk dismissals for every budget and strips legacy items from settings", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 502,
        settings: {
          forecastRiskAlerts: {
            items: [{ key: "k1" }, { key: "k2" }, { notAKey: true }],
          },
        },
      });
      prisma.budget.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      prisma.$transaction.mockImplementation(
        async (callback: (_tx: unknown) => Promise<unknown>) => callback(prisma),
      );

      await notificationCenterService.migrateLegacyForecastDismissals({
        userId: 502,
        budgetId: 7,
      });

      expect(prisma.budget.findMany).toHaveBeenCalledWith({
        where: {
          isArchived: false,
          account: { userAccounts: { some: { userId: 502 } } },
        },
        select: { id: true },
      });

      // 2 budgets x 2 valid occurrence keys
      expect(prisma.notificationDismissal.upsert).toHaveBeenCalledTimes(4);
      expect(prisma.notificationDismissal.upsert).toHaveBeenCalledWith({
        where: {
          userId_budgetId_kind_occurrenceKey: {
            userId: 502,
            budgetId: 1,
            kind: "FORECAST_RISK",
            occurrenceKey: "k1",
          },
        },
        update: {},
        create: {
          userId: 502,
          budgetId: 1,
          kind: "FORECAST_RISK",
          occurrenceKey: "k1",
        },
      });
      expect(prisma.notificationDismissal.upsert).toHaveBeenCalledWith({
        where: {
          userId_budgetId_kind_occurrenceKey: {
            userId: 502,
            budgetId: 2,
            kind: "FORECAST_RISK",
            occurrenceKey: "k2",
          },
        },
        update: {},
        create: {
          userId: 502,
          budgetId: 2,
          kind: "FORECAST_RISK",
          occurrenceKey: "k2",
        },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 502 },
        data: { settings: {} },
      });
    });

    it("keeps non-item forecastRiskAlerts settings when stripping legacy items", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 504,
        settings: {
          forecastRiskAlerts: { items: [{ key: "k1" }], daysAhead: 30 },
          otherSetting: "keep-me",
        },
      });
      prisma.budget.findMany.mockResolvedValue([{ id: 1 }]);
      prisma.$transaction.mockImplementation(
        async (callback: (_tx: unknown) => Promise<unknown>) => callback(prisma),
      );

      await notificationCenterService.migrateLegacyForecastDismissals({
        userId: 504,
        budgetId: 7,
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 504 },
        data: {
          settings: { forecastRiskAlerts: { daysAhead: 30 }, otherSetting: "keep-me" },
        },
      });
    });

    it("only runs once per user (memoized)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 503, settings: {} });

      await notificationCenterService.migrateLegacyForecastDismissals({
        userId: 503,
        budgetId: 7,
      });
      await notificationCenterService.migrateLegacyForecastDismissals({
        userId: 503,
        budgetId: 7,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("syncNotificationsForBudget", () => {
    it("throws 403 when the budget is not accessible", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        notificationCenterService.syncNotificationsForBudget({
          userId: 1,
          budgetId: 7,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.budget.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 7, isArchived: false }),
        }),
      );
    });

    it("upserts signals for risk alerts and reoccurrence issues, then resolves stale events", async () => {
      const alert = riskAlertFixture();
      const issue = recurringIssueFixture();
      evaluateForecastRiskAlerts.mockResolvedValue({ alerts: [alert] });
      getReoccurrenceHealth.mockResolvedValue({ issues: [issue] });

      await notificationCenterService.syncNotificationsForBudget({
        userId: 1,
        budgetId: 7,
        daysAhead: 30,
      });

      expect(evaluateForecastRiskAlerts).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        daysAhead: 30,
      });
      expect(getReoccurrenceHealth).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
      });

      expect(prisma.notificationEvent.upsert).toHaveBeenCalledTimes(2);
      const riskPayload = {
        key: alert.key,
        accountRegisterId: alert.accountRegisterId,
        accountRegisterName: alert.accountRegisterName,
        riskType: alert.riskType,
        threshold: alert.threshold,
        projectedBalanceAtRisk: alert.projectedBalanceAtRisk,
        projectedLowestBalance: alert.projectedLowestBalance,
        riskAt: alert.riskAt,
        daysUntilRisk: alert.daysUntilRisk,
      };
      expect(prisma.notificationEvent.upsert).toHaveBeenCalledWith({
        where: {
          userId_budgetId_kind_fingerprint: {
            userId: 1,
            budgetId: 7,
            kind: "FORECAST_RISK",
            fingerprint: "risk:11:negative_balance",
          },
        },
        update: {
          isActive: true,
          occurrenceKey: alert.key,
          payload: riskPayload,
          lastSeenAt: NOW,
          resolvedAt: null,
        },
        create: {
          userId: 1,
          budgetId: 7,
          kind: "FORECAST_RISK",
          fingerprint: "risk:11:negative_balance",
          occurrenceKey: alert.key,
          payload: riskPayload,
          isActive: true,
          firstSeenAt: NOW,
          lastSeenAt: NOW,
        },
      });
      expect(prisma.notificationEvent.upsert).toHaveBeenCalledWith({
        where: {
          userId_budgetId_kind_fingerprint: {
            userId: 1,
            budgetId: 7,
            kind: "REOCCURRENCE_HEALTH",
            fingerprint: "recurring:duplicate_rule:5",
          },
        },
        update: {
          isActive: true,
          occurrenceKey: "dup-5",
          payload: {
            type: "duplicate_rule",
            reoccurrenceId: 5,
            description: "Rent",
            accountRegisterId: 11,
            accountRegisterName: "Checking",
            details: "Duplicate rule detected",
            occurrenceKey: "dup-5",
          },
          lastSeenAt: NOW,
          resolvedAt: null,
        },
        create: expect.objectContaining({
          userId: 1,
          budgetId: 7,
          kind: "REOCCURRENCE_HEALTH",
          fingerprint: "recurring:duplicate_rule:5",
          occurrenceKey: "dup-5",
          isActive: true,
          firstSeenAt: NOW,
          lastSeenAt: NOW,
        }),
      });

      expect(prisma.notificationEvent.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.notificationEvent.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          budgetId: 7,
          kind: "FORECAST_RISK",
          isActive: true,
          fingerprint: { notIn: ["risk:11:negative_balance"] },
        },
        data: { isActive: false, resolvedAt: NOW },
      });
      expect(prisma.notificationEvent.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          budgetId: 7,
          kind: "REOCCURRENCE_HEALTH",
          isActive: true,
          fingerprint: { notIn: ["recurring:duplicate_rule:5"] },
        },
        data: { isActive: false, resolvedAt: NOW },
      });
    });

    it("uses a 90-day default horizon and deactivates stale events without a fingerprint filter when there are no signals", async () => {
      await notificationCenterService.syncNotificationsForBudget({
        userId: 2,
        budgetId: 7,
      });

      expect(evaluateForecastRiskAlerts).toHaveBeenCalledWith({
        userId: 2,
        budgetId: 7,
        daysAhead: 90,
      });
      expect(prisma.notificationEvent.upsert).not.toHaveBeenCalled();
      expect(prisma.notificationEvent.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.notificationEvent.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 2,
          budgetId: 7,
          kind: "FORECAST_RISK",
          isActive: true,
        },
        data: { isActive: false, resolvedAt: NOW },
      });
      expect(prisma.notificationEvent.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 2,
          budgetId: 7,
          kind: "REOCCURRENCE_HEALTH",
          isActive: true,
        },
        data: { isActive: false, resolvedAt: NOW },
      });
    });
  });

  describe("getNotificationSnapshot", () => {
    it("throws 403 when the budget is not accessible", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        notificationCenterService.getNotificationSnapshot({
          userId: 11,
          budgetId: 7,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("parses active events into risk alerts and recurring issues, drops dismissed ones, and merges bill/reconciliation alerts", async () => {
      const riskPayload = riskPayloadFixture();
      prisma.notificationEvent.findMany.mockResolvedValue([
        {
          id: 101,
          kind: "FORECAST_RISK",
          occurrenceKey: "11:negative_balance:2026-10-10",
          payload: riskPayload,
          lastSeenAt: NOW,
        },
        {
          id: 102,
          kind: "REOCCURRENCE_HEALTH",
          occurrenceKey: "dup-5",
          payload: {
            type: "duplicate_rule",
            reoccurrenceId: 5,
            description: "Rent",
            accountRegisterId: 11,
            accountRegisterName: "Checking",
            details: "Duplicate rule detected",
            occurrenceKey: "dup-5",
          },
          lastSeenAt: NOW,
        },
        {
          id: 103,
          kind: "FORECAST_RISK",
          occurrenceKey: "dismissed-key",
          payload: riskPayloadFixture({ key: "dismissed-key" }),
          lastSeenAt: NOW,
        },
      ]);
      prisma.notificationDismissal.findMany.mockResolvedValue([
        { kind: "FORECAST_RISK", occurrenceKey: "dismissed-key" },
      ]);

      getBillCenterSnapshot.mockResolvedValue({
        items: [
          {
            id: 201,
            status: "OVERDUE",
            amount: 120,
            dueAt: new Date("2026-09-30T00:00:00.000Z"),
            profile: {
              payee: "Electric",
              description: "Electric bill",
              register: { id: 11, name: "Checking" },
            },
          },
          {
            id: 202,
            status: "UPCOMING",
            amount: 80,
            dueAt: new Date("2026-10-20T00:00:00.000Z"),
            profile: {
              payee: null,
              description: "Gym",
              register: { id: 12, name: "Savings" },
            },
          },
          {
            id: 203,
            status: "DUE_SOON",
            amount: 60,
            dueAt: new Date("2026-10-05T00:00:00.000Z"),
            profile: {
              payee: "Water",
              description: "Water bill",
              register: { id: 11, name: "Checking" },
            },
          },
        ],
        counts: { overdue: 1, dueSoon: 1 },
      });
      getOpenReconciliationPeriodSummaries.mockResolvedValue([
        {
          id: 900,
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          updatedAt: new Date("2026-10-01T12:00:00.000Z"),
        },
      ]);

      const result = await notificationCenterService.getNotificationSnapshot({
        userId: 12,
        budgetId: 7,
      });

      expect(prisma.notificationEvent.findMany).toHaveBeenCalledWith({
        where: { userId: 12, budgetId: 7, isActive: true },
        orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      });
      expect(prisma.notificationDismissal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 12,
            budgetId: 7,
            OR: expect.arrayContaining([
              { kind: "FORECAST_RISK", occurrenceKey: "11:negative_balance:2026-10-10" },
              { kind: "REOCCURRENCE_HEALTH", occurrenceKey: "dup-5" },
              { kind: "FORECAST_RISK", occurrenceKey: "dismissed-key" },
            ]),
          }),
        }),
      );

      expect(getBillCenterSnapshot).toHaveBeenCalledWith({
        userId: 12,
        budgetId: 7,
      });
      expect(getOpenReconciliationPeriodSummaries).toHaveBeenCalledWith({
        userId: 12,
        budgetId: 7,
      });

      expect(result.riskAlerts).toEqual([
        {
          notificationId: 101,
          key: "11:negative_balance:2026-10-10",
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          riskType: "negative_balance",
          threshold: 0,
          projectedBalanceAtRisk: -50,
          projectedLowestBalance: -50,
          riskAt: "2026-10-10T00:00:00.000Z",
          daysUntilRisk: 8,
        },
      ]);
      expect(result.recurringHealthIssues).toEqual([
        {
          notificationId: 102,
          type: "duplicate_rule",
          reoccurrenceId: 5,
          description: "Rent",
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          details: "Duplicate rule detected",
          occurrenceKey: "dup-5",
        },
      ]);
      expect(result.billAlerts).toEqual([
        {
          billInstanceId: 201,
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          description: "Electric",
          amount: 120,
          dueAt: "2026-09-30T00:00:00.000Z",
          status: "OVERDUE",
        },
        {
          billInstanceId: 203,
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          description: "Water",
          amount: 60,
          dueAt: "2026-10-05T00:00:00.000Z",
          status: "DUE_SOON",
        },
      ]);
      expect(result.reconciliationAlerts).toEqual([
        {
          periodId: 900,
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          updatedAt: "2026-10-01T12:00:00.000Z",
        },
      ]);
      expect(result.total).toBe(5);
    });

    it("skips dismissal lookup and returns an empty snapshot when there are no active events", async () => {
      prisma.notificationEvent.findMany.mockResolvedValue([]);

      const result = await notificationCenterService.getNotificationSnapshot({
        userId: 13,
        budgetId: 7,
      });

      expect(prisma.notificationDismissal.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        riskAlerts: [],
        recurringHealthIssues: [],
        billAlerts: [],
        reconciliationAlerts: [],
        total: 0,
      });
    });

    it("ignores events whose payloads are malformed and falls back to the occurrence key", async () => {
      prisma.notificationEvent.findMany.mockResolvedValue([
        {
          id: 110,
          kind: "FORECAST_RISK",
          occurrenceKey: "occ-fallback",
          payload: riskPayloadFixture({ key: undefined as unknown as string }),
          lastSeenAt: NOW,
        },
        {
          id: 111,
          kind: "FORECAST_RISK",
          occurrenceKey: "bad",
          payload: {},
          lastSeenAt: NOW,
        },
        {
          id: 112,
          kind: "REOCCURRENCE_HEALTH",
          occurrenceKey: "also-bad",
          payload: null,
          lastSeenAt: NOW,
        },
      ]);
      prisma.notificationDismissal.findMany.mockResolvedValue([]);

      const result = await notificationCenterService.getNotificationSnapshot({
        userId: 14,
        budgetId: 7,
      });

      expect(result.riskAlerts).toEqual([
        expect.objectContaining({
          notificationId: 110,
          key: "occ-fallback",
        }),
      ]);
      expect(result.recurringHealthIssues).toEqual([]);
      expect(result.total).toBe(1);
    });

    it("caps bill alerts at 25 items", async () => {
      prisma.notificationEvent.findMany.mockResolvedValue([]);
      getBillCenterSnapshot.mockResolvedValue({
        items: Array.from({ length: 30 }, (_unused, index) => ({
          id: 300 + index,
          status: "OVERDUE",
          amount: 10,
          dueAt: new Date("2026-09-30T00:00:00.000Z"),
          profile: {
            payee: `Payee ${index}`,
            description: `Desc ${index}`,
            register: { id: 11, name: "Checking" },
          },
        })),
        counts: { overdue: 30 },
      });

      const result = await notificationCenterService.getNotificationSnapshot({
        userId: 15,
        budgetId: 7,
      });

      expect(result.billAlerts).toHaveLength(25);
      expect(result.billAlerts[0]).toMatchObject({ billInstanceId: 300 });
      expect(result.total).toBe(25);
    });
  });

  describe("dismissNotification", () => {
    it("throws 403 when the budget is not accessible", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        notificationCenterService.dismissNotification({
          userId: 21,
          budgetId: 7,
          notificationId: 101,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws 404 when the notification does not exist or is inactive", async () => {
      prisma.notificationEvent.findFirst.mockResolvedValue(null);

      await expect(
        notificationCenterService.dismissNotification({
          userId: 22,
          budgetId: 7,
          notificationId: 404,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(prisma.notificationEvent.findFirst).toHaveBeenCalledWith({
        where: {
          id: 404,
          userId: 22,
          budgetId: 7,
          isActive: true,
        },
        select: { kind: true, occurrenceKey: true },
      });
      expect(prisma.notificationDismissal.upsert).not.toHaveBeenCalled();
    });

    it("upserts a dismissal for the event's kind and occurrence key", async () => {
      prisma.notificationEvent.findFirst.mockResolvedValue({
        kind: "FORECAST_RISK",
        occurrenceKey: "k9",
      });

      await notificationCenterService.dismissNotification({
        userId: 23,
        budgetId: 7,
        notificationId: 101,
      });

      expect(prisma.notificationDismissal.upsert).toHaveBeenCalledWith({
        where: {
          userId_budgetId_kind_occurrenceKey: {
            userId: 23,
            budgetId: 7,
            kind: "FORECAST_RISK",
            occurrenceKey: "k9",
          },
        },
        update: { dismissedAt: NOW },
        create: {
          userId: 23,
          budgetId: 7,
          kind: "FORECAST_RISK",
          occurrenceKey: "k9",
        },
      });
    });
  });
});
