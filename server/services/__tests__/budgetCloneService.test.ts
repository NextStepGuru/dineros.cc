import { describe, it, expect, vi, beforeEach } from "vitest";
import { cloneBudget } from "../budgetCloneService";

function createMockTx() {
  const accountRegister = {
    findMany: vi.fn(),
    create: vi.fn(),
  };
  const reoccurrence = {
    findMany: vi.fn(),
    create: vi.fn(),
  };
  const registerEntry = {
    findMany: vi.fn(),
    createMany: vi.fn(),
  };
  const reoccurrenceSplit = { createMany: vi.fn() };
  const reoccurrenceSkip = { createMany: vi.fn() };
  const reoccurrencePlaidNameAlias = { createMany: vi.fn() };
  const savingsGoal = {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  };

  const tx = {
    accountRegister,
    reoccurrence,
    registerEntry,
    reoccurrenceSplit,
    reoccurrenceSkip,
    reoccurrencePlaidNameAlias,
    savingsGoal,
  };
  return { tx, accountRegister, reoccurrence, registerEntry, reoccurrenceSplit, reoccurrenceSkip, reoccurrencePlaidNameAlias, savingsGoal };
}

describe("budgetCloneService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("empty source", () => {
    it("returns without calling create when source has no registers", async () => {
      const { tx, accountRegister } = createMockTx();
      accountRegister.findMany.mockResolvedValue([]);

      await cloneBudget(tx as any, 1, 2, "acc-1");

      expect(accountRegister.findMany).toHaveBeenCalledWith({
        where: { budgetId: 1, accountId: "acc-1", isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
      expect(accountRegister.create).not.toHaveBeenCalled();
      expect(tx.reoccurrence.findMany).not.toHaveBeenCalled();
    });
  });

  describe("flat clone (no subaccounts)", () => {
    it("clones registers and uses array for in filter", async () => {
      const { tx, accountRegister, reoccurrence, registerEntry } = createMockTx();
      const sourceRegisters = [
        {
          id: 10,
          accountId: "acc-1",
          budgetId: 1,
          typeId: 1,
          name: "Checking",
          sortOrder: 0,
          subAccountRegisterId: null,
          targetAccountRegisterId: null,
          collateralAssetRegisterId: null,
          balance: 0,
          creditLimit: null,
          latestBalance: null,
          minPayment: null,
          statementAt: null,
          statementIntervalId: null,
          apr1: null,
          apr1StartAt: null,
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: null,
          savingsGoalSortOrder: null,
          accountSavingsGoal: null,
          minAccountBalance: null,
          allowExtraPayment: null,
        },
      ];
      accountRegister.findMany.mockResolvedValue(sourceRegisters);
      accountRegister.create.mockResolvedValue({ id: 100 });
      reoccurrence.findMany.mockResolvedValue([]);
      registerEntry.findMany.mockResolvedValue([]);

      await cloneBudget(tx as any, 1, 2, "acc-1");

      expect(accountRegister.create).toHaveBeenCalledTimes(1);
      expect(accountRegister.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          budgetId: 2,
          name: "Checking",
          accountId: "acc-1",
          typeId: 1,
          plaidId: null,
          plaidAccessToken: null,
        }),
        select: { id: true },
      });
      const inArg = reoccurrence.findMany.mock.calls[0][0].where.accountRegisterId.in;
      expect(Array.isArray(inArg)).toBe(true);
      expect(inArg).toEqual([10]);
    });

    it("clones reoccurrences and entries with mapped register ids", async () => {
      const { tx, accountRegister, reoccurrence, registerEntry } = createMockTx();
      const sourceRegisters = [
        {
          id: 10,
          accountId: "acc-1",
          budgetId: 1,
          typeId: 1,
          name: "Checking",
          sortOrder: 0,
          subAccountRegisterId: null,
          targetAccountRegisterId: null,
          collateralAssetRegisterId: null,
          balance: 0,
          creditLimit: null,
          latestBalance: null,
          minPayment: null,
          statementAt: null,
          statementIntervalId: null,
          apr1: null,
          apr1StartAt: null,
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: null,
          savingsGoalSortOrder: null,
          accountSavingsGoal: null,
          minAccountBalance: null,
          allowExtraPayment: null,
        },
      ];
      accountRegister.findMany.mockResolvedValue(sourceRegisters);
      accountRegister.create.mockResolvedValue({ id: 100 });
      reoccurrence.findMany.mockResolvedValue([
        {
          id: 1,
          accountId: "acc-1",
          accountRegisterId: 10,
          intervalId: 1,
          transferAccountRegisterId: null,
          adjustBeforeIfOnWeekend: null,
          intervalCount: 1,
          lastAt: new Date("2024-01-01"),
          endAt: null,
          totalIntervals: null,
          elapsedIntervals: null,
          amount: -100,
          description: "Rent",
          categoryId: null,
          splits: [],
          skips: [],
          plaidNameAliases: [],
        },
      ]);
      reoccurrence.create.mockResolvedValue({ id: 200 });
      registerEntry.findMany.mockResolvedValue([]);

      await cloneBudget(tx as any, 1, 2, "acc-1");

      expect(reoccurrence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountRegisterId: 100,
          amount: -100,
          description: "Rent",
        }),
        select: { id: true },
      });
    });
  });

  describe("parent/child ordering", () => {
    it("creates parent before child when subAccountRegisterId is set", async () => {
      const { tx, accountRegister, reoccurrence, registerEntry } = createMockTx();
      const parent = {
        id: 10,
        accountId: "acc-1",
        budgetId: 1,
        typeId: 1,
        name: "Parent",
        sortOrder: 0,
        subAccountRegisterId: null,
        targetAccountRegisterId: null,
        collateralAssetRegisterId: null,
        balance: 0,
        creditLimit: null,
        latestBalance: null,
        minPayment: null,
        statementAt: null,
        statementIntervalId: null,
        apr1: null,
        apr1StartAt: null,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: null,
        savingsGoalSortOrder: null,
        accountSavingsGoal: null,
        minAccountBalance: null,
        allowExtraPayment: null,
      };
      const child = {
        ...parent,
        id: 11,
        name: "Child",
        sortOrder: 1,
        subAccountRegisterId: 10,
      };
      accountRegister.findMany.mockResolvedValue([parent, child]);
      accountRegister.create.mockImplementation((args: any) => {
        const name = args.data.name;
        return Promise.resolve({ id: name === "Parent" ? 100 : 101 });
      });
      reoccurrence.findMany.mockResolvedValue([]);
      registerEntry.findMany.mockResolvedValue([]);

      await cloneBudget(tx as any, 1, 2, "acc-1");

      expect(accountRegister.create).toHaveBeenCalledTimes(2);
      const firstCall = accountRegister.create.mock.calls[0][0];
      const secondCall = accountRegister.create.mock.calls[1][0];
      expect(firstCall.data.name).toBe("Parent");
      expect(firstCall.data.subAccountRegisterId).toBeNull();
      expect(secondCall.data.name).toBe("Child");
      expect(secondCall.data.subAccountRegisterId).toBe(100);
    });
  });

  describe("cycle / missing parent", () => {
    it("throws when registers form cycle", async () => {
      const { tx, accountRegister } = createMockTx();
      const a = {
        id: 10,
        accountId: "acc-1",
        budgetId: 1,
        typeId: 1,
        name: "A",
        sortOrder: 0,
        subAccountRegisterId: 11,
        targetAccountRegisterId: null,
        collateralAssetRegisterId: null,
        balance: 0,
        creditLimit: null,
        latestBalance: null,
        minPayment: null,
        statementAt: null,
        statementIntervalId: null,
        apr1: null,
        apr1StartAt: null,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: null,
        savingsGoalSortOrder: null,
        accountSavingsGoal: null,
        minAccountBalance: null,
        allowExtraPayment: null,
      };
      const b = { ...a, id: 11, name: "B", subAccountRegisterId: 10 };
      accountRegister.findMany.mockResolvedValue([a, b]);

      await expect(cloneBudget(tx as any, 1, 2, "acc-1")).rejects.toThrow(
        "Budget clone: cycle or parent register missing in source budget"
      );
    });

    it("throws when parent register is missing from source", async () => {
      const { tx, accountRegister } = createMockTx();
      const child = {
        id: 11,
        accountId: "acc-1",
        budgetId: 1,
        typeId: 1,
        name: "Child",
        sortOrder: 0,
        subAccountRegisterId: 99,
        targetAccountRegisterId: null,
        collateralAssetRegisterId: null,
        balance: 0,
        creditLimit: null,
        latestBalance: null,
        minPayment: null,
        statementAt: null,
        statementIntervalId: null,
        apr1: null,
        apr1StartAt: null,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: null,
        savingsGoalSortOrder: null,
        accountSavingsGoal: null,
        minAccountBalance: null,
        allowExtraPayment: null,
      };
      accountRegister.findMany.mockResolvedValue([child]);

      await expect(cloneBudget(tx as any, 1, 2, "acc-1")).rejects.toThrow(
        "Budget clone: cycle or parent register missing in source budget"
      );
    });
  });

  describe("Plaid nulling", () => {
    it("nulls Plaid fields on cloned account register", async () => {
      const { tx, accountRegister, reoccurrence, registerEntry } = createMockTx();
      const sourceRegisters = [
        {
          id: 10,
          accountId: "acc-1",
          budgetId: 1,
          typeId: 1,
          name: "Checking",
          sortOrder: 0,
          subAccountRegisterId: null,
          targetAccountRegisterId: null,
          collateralAssetRegisterId: null,
          balance: 0,
          creditLimit: null,
          latestBalance: null,
          minPayment: null,
          statementAt: null,
          statementIntervalId: null,
          apr1: null,
          apr1StartAt: null,
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: null,
          savingsGoalSortOrder: null,
          accountSavingsGoal: null,
          minAccountBalance: null,
          allowExtraPayment: null,
          plaidId: "plaid-123",
          plaidAccessToken: "token",
          plaidJson: {},
        } as any,
      ];
      accountRegister.findMany.mockResolvedValue(sourceRegisters);
      accountRegister.create.mockResolvedValue({ id: 100 });
      reoccurrence.findMany.mockResolvedValue([]);
      registerEntry.findMany.mockResolvedValue([]);

      await cloneBudget(tx as any, 1, 2, "acc-1");

      const createData = accountRegister.create.mock.calls[0][0].data;
      expect(createData.plaidId).toBeNull();
      expect(createData.plaidAccessToken).toBeNull();
      expect(createData.plaidJson).toBeNull();
    });
  });

  describe("cross-budget FKs", () => {
    it("remaps targetAccountRegisterId when in source set, nulls when not", async () => {
      const { tx, accountRegister, reoccurrence, registerEntry } = createMockTx();
      const reg1 = {
        id: 10,
        accountId: "acc-1",
        budgetId: 1,
        typeId: 1,
        name: "Reg1",
        sortOrder: 0,
        subAccountRegisterId: null,
        targetAccountRegisterId: null,
        collateralAssetRegisterId: null,
        balance: 0,
        creditLimit: null,
        latestBalance: null,
        minPayment: null,
        statementAt: null,
        statementIntervalId: null,
        apr1: null,
        apr1StartAt: null,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: null,
        savingsGoalSortOrder: null,
        accountSavingsGoal: null,
        minAccountBalance: null,
        allowExtraPayment: null,
      };
      const reg2 = {
        ...reg1,
        id: 11,
        name: "Reg2",
        sortOrder: 1,
        targetAccountRegisterId: 10,
      };
      accountRegister.findMany.mockResolvedValue([reg1, reg2]);
      accountRegister.create.mockImplementation((args: any) => {
        const name = args.data.name;
        return Promise.resolve({ id: name === "Reg1" ? 100 : 101 });
      });
      reoccurrence.findMany.mockResolvedValue([]);
      registerEntry.findMany.mockResolvedValue([]);

      await cloneBudget(tx as any, 1, 2, "acc-1");

      const reg2Create = accountRegister.create.mock.calls.find(
        (c: any) => c[0].data.name === "Reg2"
      )[0];
      expect(reg2Create.data.targetAccountRegisterId).toBe(100);
    });
  });

  describe("splits, skips, aliases", () => {
    it("clones reoccurrence splits with new reoccurrence and register ids", async () => {
      const { tx, accountRegister, reoccurrence, registerEntry, reoccurrenceSplit } = createMockTx();
      const sourceRegisters = [
        {
          id: 10,
          accountId: "acc-1",
          budgetId: 1,
          typeId: 1,
          name: "Checking",
          sortOrder: 0,
          subAccountRegisterId: null,
          targetAccountRegisterId: null,
          collateralAssetRegisterId: null,
          balance: 0,
          creditLimit: null,
          latestBalance: null,
          minPayment: null,
          statementAt: null,
          statementIntervalId: null,
          apr1: null,
          apr1StartAt: null,
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: null,
          savingsGoalSortOrder: null,
          accountSavingsGoal: null,
          minAccountBalance: null,
          allowExtraPayment: null,
        },
        {
          id: 11,
          accountId: "acc-1",
          budgetId: 1,
          typeId: 1,
          name: "Savings",
          sortOrder: 1,
          subAccountRegisterId: null,
          targetAccountRegisterId: null,
          collateralAssetRegisterId: null,
          balance: 0,
          creditLimit: null,
          latestBalance: null,
          minPayment: null,
          statementAt: null,
          statementIntervalId: null,
          apr1: null,
          apr1StartAt: null,
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: null,
          savingsGoalSortOrder: null,
          accountSavingsGoal: null,
          minAccountBalance: null,
          allowExtraPayment: null,
        },
      ];
      accountRegister.findMany.mockResolvedValue(sourceRegisters);
      accountRegister.create.mockImplementation((args: any) =>
        Promise.resolve({ id: args.data.name === "Checking" ? 100 : 101 })
      );
      reoccurrence.findMany.mockResolvedValue([
        {
          id: 1,
          accountId: "acc-1",
          accountRegisterId: 10,
          intervalId: 1,
          transferAccountRegisterId: 11,
          adjustBeforeIfOnWeekend: null,
          intervalCount: 1,
          lastAt: new Date("2024-01-01"),
          endAt: null,
          totalIntervals: null,
          elapsedIntervals: null,
          amount: -50,
          description: "Split",
          categoryId: null,
          splits: [
            { reoccurrenceId: 1, transferAccountRegisterId: 11, amount: 50, description: "To savings", sortOrder: 0 },
          ],
          skips: [],
          plaidNameAliases: [],
        },
      ]);
      reoccurrence.create.mockResolvedValue({ id: 200 });
      registerEntry.findMany.mockResolvedValue([]);

      await cloneBudget(tx as any, 1, 2, "acc-1");

      expect(reoccurrenceSplit.createMany).toHaveBeenCalledWith({
        data: [
          {
            reoccurrenceId: 200,
            transferAccountRegisterId: 101,
            amount: 50,
            description: "To savings",
            sortOrder: 0,
          },
        ],
      });
    });
  });
});
