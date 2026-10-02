import { describe, it, expect, vi, beforeEach } from "vitest";

const { hashMock, FIXED_NOW_MS } = vi.hoisted(() => ({
  hashMock: vi.fn(),
  FIXED_NOW_MS: Date.parse("2024-01-01T00:00:00.000Z"),
}));

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/services/HashService", () => ({
  default: class MockHashService {
    hash = hashMock;
  },
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    nowDate: vi.fn(() => new Date(FIXED_NOW_MS)),
  },
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

const FIXED_NOW = new Date(FIXED_NOW_MS);
const E2E_EMAIL = "e2e-test@dineros.cc";

describe("e2eSeedService", () => {
  let seedE2EUser: () => Promise<any>;
  let deleteE2EUserByEmail: (
    _email?: string,
  ) => Promise<{ deleted: boolean }>;
  let E2E_USER_EMAIL: string;
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    hashMock.mockResolvedValue("hashed-password");

    const service = await import("~/server/services/e2eSeedService");
    seedE2EUser = service.seedE2EUser;
    deleteE2EUserByEmail = service.deleteE2EUserByEmail;
    E2E_USER_EMAIL = service.E2E_USER_EMAIL;

    const client = await import("~/server/clients/prismaClient");
    prisma = client.prisma;
    // Pass the mock prisma through as the transaction client
    (prisma.$transaction as any).mockImplementation(
      async (callback: (_tx: unknown) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  describe("E2E_USER_EMAIL", () => {
    it("exposes the stable E2E email", () => {
      expect(E2E_USER_EMAIL).toBe("e2e-test@dineros.cc");
    });
  });

  describe("seedE2EUser", () => {
    it("creates a fresh user and full workspace, returning credentials and ids", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      (prisma.user.create as any).mockResolvedValue({ id: 1 });
      (prisma.account.create as any).mockResolvedValue({ id: "account-1" });
      (prisma.budget.create as any).mockResolvedValue({ id: 10 });
      (prisma.userAccount.create as any).mockResolvedValue({});
      (prisma.accountRegister.create as any)
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 200 });
      (prisma.registerEntry.create as any).mockResolvedValue({});
      (prisma.category.create as any).mockResolvedValue({ id: "category-1" });
      (prisma.reoccurrence.create as any).mockResolvedValue({ id: 300 });
      (prisma.savingsGoal.create as any).mockResolvedValue({ id: 400 });

      const result = await seedE2EUser();

      expect(result).toEqual({
        email: E2E_EMAIL,
        password: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) as unknown,
        userId: 1,
        budgetId: 10,
        accountId: "account-1",
        checkingRegisterId: 100,
        savingsRegisterId: 200,
        categoryId: "category-1",
        reoccurrenceId: 300,
        savingsGoalId: 400,
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("hashes a random password and stores the hash on the created user", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      (prisma.user.create as any).mockResolvedValue({ id: 1 });
      (prisma.account.create as any).mockResolvedValue({ id: "account-1" });
      (prisma.budget.create as any).mockResolvedValue({ id: 10 });
      (prisma.accountRegister.create as any)
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 200 });
      (prisma.category.create as any).mockResolvedValue({ id: "category-1" });
      (prisma.reoccurrence.create as any).mockResolvedValue({ id: 300 });
      (prisma.savingsGoal.create as any).mockResolvedValue({ id: 400 });

      const result = await seedE2EUser();

      // The returned plaintext password is exactly what got hashed
      expect(hashMock).toHaveBeenCalledTimes(1);
      expect(hashMock).toHaveBeenCalledWith(result.password);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: "E2E",
          lastName: "Test",
          email: E2E_EMAIL,
          password: "hashed-password",
          countryId: 840,
          settings: {},
          config: {},
        }),
        select: { id: true },
      });
    });

    it("replaces an existing E2E user before seeding (idempotent reruns)", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 5 });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { accountId: "account-1" },
      ]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 100 },
      ]);
      (prisma.reoccurrence.findMany as any).mockResolvedValue([]);
      (prisma.accountSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.accountRegisterSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      (prisma.user.create as any).mockResolvedValue({ id: 1 });
      (prisma.account.create as any).mockResolvedValue({ id: "account-1" });
      (prisma.budget.create as any).mockResolvedValue({ id: 10 });
      (prisma.accountRegister.create as any)
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 200 });
      (prisma.category.create as any).mockResolvedValue({ id: "category-1" });
      (prisma.reoccurrence.create as any).mockResolvedValue({ id: 300 });
      (prisma.savingsGoal.create as any).mockResolvedValue({ id: 400 });

      await seedE2EUser();

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(
        prisma.user.delete.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.user.create.mock.invocationCallOrder[0]);
    });

    it("skips deletion when no E2E user exists yet", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      (prisma.user.create as any).mockResolvedValue({ id: 1 });
      (prisma.account.create as any).mockResolvedValue({ id: "account-1" });
      (prisma.budget.create as any).mockResolvedValue({ id: 10 });
      (prisma.accountRegister.create as any)
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 200 });
      (prisma.category.create as any).mockResolvedValue({ id: "category-1" });
      (prisma.reoccurrence.create as any).mockResolvedValue({ id: 300 });
      (prisma.savingsGoal.create as any).mockResolvedValue({ id: 400 });

      await seedE2EUser();

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it("creates default account, budget, checking/savings registers and entries", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      (prisma.user.create as any).mockResolvedValue({ id: 1 });
      (prisma.account.create as any).mockResolvedValue({ id: "account-1" });
      (prisma.budget.create as any).mockResolvedValue({ id: 10 });
      (prisma.accountRegister.create as any)
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 200 });
      (prisma.category.create as any).mockResolvedValue({ id: "category-1" });
      (prisma.reoccurrence.create as any).mockResolvedValue({ id: 300 });
      (prisma.savingsGoal.create as any).mockResolvedValue({ id: 400 });

      await seedE2EUser();

      expect(prisma.account.create).toHaveBeenCalledWith({
        data: { name: "E2E Default", isDefault: true },
        select: { id: true },
      });
      expect(prisma.budget.create).toHaveBeenCalledWith({
        data: {
          name: "E2E Budget",
          userId: 1,
          accountId: "account-1",
          isDefault: true,
        },
        select: { id: true },
      });
      expect(prisma.userAccount.create).toHaveBeenCalledWith({
        data: { accountId: "account-1", userId: 1 },
      });
      expect(prisma.accountRegister.create).toHaveBeenCalledTimes(2);
      expect(prisma.accountRegister.create).toHaveBeenNthCalledWith(1, {
        data: {
          name: "E2E Checking",
          balance: 1000,
          latestBalance: 1000,
          statementAt: FIXED_NOW,
          interval: { connect: { id: 3 } },
          account: { connect: { id: "account-1" } },
          type: { connect: { id: 1 } },
          budget: { connect: { id: 10 } },
        },
        select: { id: true },
      });
      expect(prisma.accountRegister.create).toHaveBeenNthCalledWith(2, {
        data: {
          name: "E2E Savings",
          balance: 0,
          latestBalance: 0,
          statementAt: FIXED_NOW,
          interval: { connect: { id: 3 } },
          account: { connect: { id: "account-1" } },
          type: { connect: { id: 1 } },
          budget: { connect: { id: 10 } },
        },
        select: { id: true },
      });
    });

    it("creates balance entries, a seeded transaction, reoccurrence and savings goal", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      (prisma.user.create as any).mockResolvedValue({ id: 1 });
      (prisma.account.create as any).mockResolvedValue({ id: "account-1" });
      (prisma.budget.create as any).mockResolvedValue({ id: 10 });
      (prisma.accountRegister.create as any)
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 200 });
      (prisma.category.create as any).mockResolvedValue({ id: "category-1" });
      (prisma.reoccurrence.create as any).mockResolvedValue({ id: 300 });
      (prisma.savingsGoal.create as any).mockResolvedValue({ id: 400 });

      await seedE2EUser();

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: "E2E Groceries",
          accountId: "account-1",
          isArchived: false,
        },
        select: { id: true },
      });
      expect(prisma.registerEntry.create).toHaveBeenCalledTimes(3);
      expect(prisma.registerEntry.create).toHaveBeenNthCalledWith(1, {
        data: {
          accountRegisterId: 100,
          description: "Initial Balance",
          amount: 1000,
          balance: 1000,
          isBalanceEntry: true,
          isManualEntry: false,
          hasBalanceReCalc: true,
          createdAt: FIXED_NOW,
        },
      });
      expect(prisma.registerEntry.create).toHaveBeenNthCalledWith(2, {
        data: {
          accountRegisterId: 200,
          description: "Initial Balance",
          amount: 0,
          balance: 0,
          isBalanceEntry: true,
          isManualEntry: false,
          hasBalanceReCalc: true,
          createdAt: FIXED_NOW,
        },
      });
      expect(prisma.registerEntry.create).toHaveBeenNthCalledWith(3, {
        data: {
          accountRegisterId: 100,
          description: "E2E seeded transaction",
          amount: -25.5,
          balance: 974.5,
          isManualEntry: true,
          hasBalanceReCalc: true,
          categoryId: "category-1",
          createdAt: FIXED_NOW,
        },
      });
      expect(prisma.reoccurrence.create).toHaveBeenCalledWith({
        data: {
          accountId: "account-1",
          accountRegisterId: 100,
          intervalId: 3,
          intervalCount: 1,
          amount: -50,
          description: "E2E Monthly Bill",
          lastAt: FIXED_NOW,
          categoryId: "category-1",
        },
        select: { id: true },
      });
      expect(prisma.savingsGoal.create).toHaveBeenCalledWith({
        data: {
          accountId: "account-1",
          budgetId: 10,
          name: "E2E Emergency Fund",
          targetAmount: 500,
          sourceAccountRegisterId: 100,
          targetAccountRegisterId: 200,
          categoryId: "category-1",
          sortOrder: 0,
        },
        select: { id: true },
      });
    });

    it("falls back to countryId null when the default country is missing", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({ id: 1 });
      (prisma.account.create as any).mockResolvedValue({ id: "account-1" });
      (prisma.budget.create as any).mockResolvedValue({ id: 10 });
      (prisma.accountRegister.create as any)
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 200 });
      (prisma.category.create as any).mockResolvedValue({ id: "category-1" });
      (prisma.reoccurrence.create as any).mockResolvedValue({ id: 300 });
      (prisma.savingsGoal.create as any).mockResolvedValue({ id: 400 });

      await seedE2EUser();

      expect(prisma.country.findUnique).toHaveBeenCalledWith({
        where: { id: 840 },
        select: { id: true },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ countryId: null }),
        select: { id: true },
      });
    });

    it("logs the seeded user and propagates transaction failures", async () => {
      const { log } = await import("~/server/logger");

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      (prisma.user.create as any).mockResolvedValue({ id: 1 });
      (prisma.account.create as any).mockResolvedValue({ id: "account-1" });
      (prisma.budget.create as any).mockResolvedValue({ id: 10 });
      (prisma.accountRegister.create as any)
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 200 });
      (prisma.category.create as any).mockResolvedValue({ id: "category-1" });
      (prisma.reoccurrence.create as any).mockResolvedValue({ id: 300 });
      (prisma.savingsGoal.create as any).mockResolvedValue({ id: 400 });

      await seedE2EUser();

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "E2E user seeded",
          level: "info",
          data: { email: E2E_EMAIL, userId: 1 },
        }),
      );

      (prisma.$transaction as any).mockRejectedValue(
        new Error("transaction aborted"),
      );
      await expect(seedE2EUser()).rejects.toThrow("transaction aborted");
    });
  });

  describe("deleteE2EUserByEmail", () => {
    it("returns deleted false and does nothing when the user is missing", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const result = await deleteE2EUserByEmail(E2E_EMAIL);

      expect(result).toEqual({ deleted: false });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: E2E_EMAIL },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("defaults to the stable E2E email when called without arguments", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await deleteE2EUserByEmail();

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: E2E_EMAIL },
      });
    });

    it("deletes the user directly when they have no accounts", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 7 });
      (prisma.userAccount.findMany as any).mockResolvedValue([]);

      const result = await deleteE2EUserByEmail(E2E_EMAIL);

      expect(result).toEqual({ deleted: true });
      expect(prisma.userAccount.findMany).toHaveBeenCalledWith({
        where: { userId: 7 },
        select: { accountId: true },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    });

    it("runs the full cascade inside a transaction for a user with accounts", async () => {
      const { log } = await import("~/server/logger");

      (prisma.user.findUnique as any).mockResolvedValue({ id: 5 });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { accountId: "account-1" },
        { accountId: "account-2" },
      ]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([
        { id: 100 },
        { id: 200 },
      ]);
      (prisma.reoccurrence.findMany as any).mockResolvedValue([{ id: 300 }]);
      (prisma.accountSnapshot.findMany as any).mockResolvedValue([
        { id: "snap-1" },
      ]);
      (prisma.accountRegisterSnapshot.findMany as any).mockResolvedValue([
        { id: "ar-snap-1" },
      ]);

      const result = await deleteE2EUserByEmail(E2E_EMAIL);

      expect(result).toEqual({ deleted: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: { accountRegisterId: { in: [100, 200] } },
      });
      expect(prisma.reoccurrence.findMany).toHaveBeenCalledWith({
        where: { accountId: { in: ["account-1", "account-2"] } },
        select: { id: true },
      });
      expect(prisma.reoccurrenceSplit.deleteMany).toHaveBeenCalledWith({
        where: { reoccurrenceId: { in: [300] } },
      });
      expect(prisma.reoccurrencePlaidNameAlias.deleteMany).toHaveBeenCalledWith(
        { where: { reoccurrenceId: { in: [300] } } },
      );
      expect(prisma.reoccurrenceSkip.deleteMany).toHaveBeenCalledWith({
        where: { reoccurrenceId: { in: [300] } },
      });
      expect(prisma.reoccurrence.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [300] } },
      });
      expect(prisma.savingsGoal.deleteMany).toHaveBeenCalledWith({
        where: { accountId: { in: ["account-1", "account-2"] } },
      });
      expect(prisma.registerEntrySnapshot.deleteMany).toHaveBeenCalledWith({
        where: { registerSnapshotId: { in: ["ar-snap-1"] } },
      });
      expect(prisma.accountRegisterSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { snapshotId: { in: ["snap-1"] } },
      });
      expect(prisma.accountSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { accountId: { in: ["account-1", "account-2"] } },
      });
      expect(prisma.accountRegisterSummary.deleteMany).toHaveBeenCalledWith({
        where: { accountRegisterId: { in: [100, 200] } },
      });
      expect(prisma.accountRegister.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [100, 200] } },
        data: { paymentCategoryId: null, interestCategoryId: null },
      });
      expect(prisma.category.deleteMany).toHaveBeenCalledWith({
        where: { accountId: { in: ["account-1", "account-2"] } },
      });
      expect(prisma.accountRegister.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [100, 200] } },
      });
      expect(prisma.budget.deleteMany).toHaveBeenCalledWith({
        where: { userId: 5 },
      });
      expect(prisma.userAccount.deleteMany).toHaveBeenCalledWith({
        where: { userId: 5 },
      });
      expect(prisma.account.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["account-1", "account-2"] } },
      });
      expect(prisma.plaidItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: 5 },
      });
      expect(prisma.userSocial.deleteMany).toHaveBeenCalledWith({
        where: { userId: 5 },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 5 } });
      // accountInvite.deleteMany runs twice: per-account invites + user invites
      expect(prisma.accountInvite.deleteMany).toHaveBeenCalledTimes(2);
      expect(prisma.accountInvite.deleteMany).toHaveBeenNthCalledWith(1, {
        where: {
          inviteAccounts: {
            some: { accountId: { in: ["account-1", "account-2"] } },
          },
        },
      });
      expect(prisma.accountInvite.deleteMany).toHaveBeenNthCalledWith(2, {
        where: { invitedByUserId: 5 },
      });
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "E2E user deleted",
          level: "info",
          data: { email: E2E_EMAIL },
        }),
      );
    });

    it("propagates transaction failures", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 5 });
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { accountId: "account-1" },
      ]);
      (prisma.accountRegister.findMany as any).mockResolvedValue([]);
      (prisma.$transaction as any).mockRejectedValue(
        new Error("cascade failed"),
      );

      await expect(deleteE2EUserByEmail(E2E_EMAIL)).rejects.toThrow(
        "cascade failed",
      );
    });
  });
});
