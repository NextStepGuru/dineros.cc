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

vi.mock("~/server/services/billCenterService", () => ({
  syncBillCenter: vi.fn(),
  getBillCenterSnapshot: vi.fn(),
  updateBillInstanceStatus: vi.fn(),
  updateBillProfile: vi.fn(),
  evaluateBillReminders: vi.fn(),
  evaluateBillRemindersForAllBudgets: vi.fn(),
}));

const snapshotFixture = {
  items: [{ id: 201, status: "DUE_SOON" }],
  counts: { overdue: 0, dueSoon: 1, dueToday: 0, upcoming: 0, paid: 0, skipped: 0, partial: 0 },
};

describe("Bill Center API Endpoints", () => {
  let getUser: any;
  let handleApiError: any;
  let getBillCenterSnapshot: any;
  let updateBillInstanceStatus: any;
  let updateBillProfile: any;
  let evaluateBillReminders: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-create the global h3 shims after clearing mocks
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
    (globalThis as any).getRouterParam = vi.fn();

    ({ getUser } = await import("~/server/lib/getUser"));
    ({ handleApiError } = await import("~/server/lib/handleApiError"));
    ({
      getBillCenterSnapshot,
      updateBillInstanceStatus,
      updateBillProfile,
      evaluateBillReminders,
    } = await import("~/server/services/billCenterService"));

    getUser.mockReturnValue({ userId: 1 });
    getBillCenterSnapshot.mockResolvedValue(snapshotFixture);
    updateBillInstanceStatus.mockResolvedValue({ id: 201, status: "PAID" });
    updateBillProfile.mockResolvedValue({ id: 500, payee: "Landlord" });
    evaluateBillReminders.mockResolvedValue({
      remindedCount: 2,
      overdueCount: 1,
      dueSoonCount: 1,
    });
  });

  describe("GET /api/bills", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../bills.get");
      handler = module.default;
    });

    it("returns the bill center snapshot for the query window", async () => {
      (globalThis as any).getQuery.mockReturnValue({
        budgetId: "7",
        from: "2026-10-01",
        to: "2026-10-31",
        includeIncome: "true",
      });

      const result = await handler({});

      expect(result).toEqual(snapshotFixture);
      expect(getBillCenterSnapshot).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        from: "2026-10-01",
        to: "2026-10-31",
        includeIncome: true,
      });
    });

    it("defaults includeIncome to false when the query omits it", async () => {
      (globalThis as any).getQuery.mockReturnValue({ budgetId: 7 });

      await handler({});

      expect(getBillCenterSnapshot).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
        from: undefined,
        to: undefined,
        includeIncome: false,
      });
    });

    it("rejects invalid queries and reports to handleApiError", async () => {
      (globalThis as any).getQuery.mockReturnValue({});

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(getBillCenterSnapshot).not.toHaveBeenCalled();
    });

    it("propagates service failures through handleApiError", async () => {
      (globalThis as any).getQuery.mockReturnValue({ budgetId: 7 });
      const boom = new Error("snapshot failed");
      getBillCenterSnapshot.mockRejectedValue(boom);

      await expect(handler({})).rejects.toThrow("snapshot failed");
      expect(handleApiError).toHaveBeenCalledWith(boom);
    });
  });

  describe("POST /api/bills/reminders/evaluate", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../bills/reminders/evaluate.post");
      handler = module.default;
    });

    it("evaluates reminders for the budget and returns the counts", async () => {
      (globalThis as any).readBody.mockResolvedValue({ budgetId: 7 });

      const result = await handler({});

      expect(result).toEqual({
        remindedCount: 2,
        overdueCount: 1,
        dueSoonCount: 1,
      });
      expect(evaluateBillReminders).toHaveBeenCalledWith({
        userId: 1,
        budgetId: 7,
      });
    });

    it("rejects a body without budgetId and reports to handleApiError", async () => {
      (globalThis as any).readBody.mockResolvedValue({});

      await expect(handler({})).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(evaluateBillReminders).not.toHaveBeenCalled();
    });

    it("propagates service failures through handleApiError", async () => {
      (globalThis as any).readBody.mockResolvedValue({ budgetId: 7 });
      const boom = new Error("evaluate failed");
      evaluateBillReminders.mockRejectedValue(boom);

      await expect(handler({})).rejects.toThrow("evaluate failed");
      expect(handleApiError).toHaveBeenCalledWith(boom);
    });
  });

  describe("PATCH /api/bill-instance/[id]", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../bill-instance/[id].patch");
      handler = module.default;
    });

    it("updates the instance status from the route param and body", async () => {
      (globalThis as any).readBody.mockResolvedValue({
        status: "PAID",
        note: "done",
        paidAmount: 50,
      });

      const result = await handler({ context: { params: { id: "201" } } });

      expect(result).toEqual({ id: 201, status: "PAID" });
      expect(updateBillInstanceStatus).toHaveBeenCalledWith({
        userId: 1,
        billInstanceId: 201,
        status: "PAID",
        note: "done",
        paidAmount: 50,
        paidRegisterEntryId: undefined,
      });
    });

    it("rejects non-numeric route ids without touching the service", async () => {
      (globalThis as any).readBody.mockResolvedValue({ status: "PAID" });

      await expect(
        handler({ context: { params: { id: "abc" } } }),
      ).rejects.toThrow();
      expect(updateBillInstanceStatus).not.toHaveBeenCalled();
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("rejects unknown statuses without touching the service", async () => {
      (globalThis as any).readBody.mockResolvedValue({ status: "NOPE" });

      await expect(
        handler({ context: { params: { id: "201" } } }),
      ).rejects.toThrow();
      expect(updateBillInstanceStatus).not.toHaveBeenCalled();
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("propagates service failures through handleApiError", async () => {
      (globalThis as any).readBody.mockResolvedValue({ status: "PAID" });
      const notFound = new Error("HTTP 404: Bill instance not found");
      (notFound as any).statusCode = 404;
      updateBillInstanceStatus.mockRejectedValue(notFound);

      await expect(
        handler({ context: { params: { id: "201" } } }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(handleApiError).toHaveBeenCalledWith(notFound);
    });
  });

  describe("PATCH /api/bills/profile/[id]", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../bills/profile/[id].patch");
      handler = module.default;
    });

    it("updates the bill profile from the route param and body", async () => {
      (globalThis as any).readBody.mockResolvedValue({
        payee: "Landlord",
        graceDays: 5,
        isAutoPay: true,
      });

      const result = await handler({ context: { params: { id: "500" } } });

      expect(result).toEqual({ id: 500, payee: "Landlord" });
      expect(updateBillProfile).toHaveBeenCalledWith({
        userId: 1,
        billProfileId: 500,
        kind: undefined,
        payee: "Landlord",
        isAutoPay: true,
        graceDays: 5,
        expectedAmountLow: undefined,
        expectedAmountHigh: undefined,
        reminderDaysBefore: undefined,
        priority: undefined,
      });
    });

    it("rejects non-numeric route ids without touching the service", async () => {
      (globalThis as any).readBody.mockResolvedValue({ payee: "X" });

      await expect(
        handler({ context: { params: { id: "abc" } } }),
      ).rejects.toThrow();
      expect(updateBillProfile).not.toHaveBeenCalled();
      expect(handleApiError).toHaveBeenCalledTimes(1);
    });

    it("propagates service failures through handleApiError", async () => {
      (globalThis as any).readBody.mockResolvedValue({ payee: "Landlord" });
      const notFound = new Error("HTTP 404: Bill profile not found");
      (notFound as any).statusCode = 404;
      updateBillProfile.mockRejectedValue(notFound);

      await expect(
        handler({ context: { params: { id: "500" } } }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(handleApiError).toHaveBeenCalledWith(notFound);
    });
  });
});
