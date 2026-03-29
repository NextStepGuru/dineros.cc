import { describe, expect, it } from "vitest";
import {
  filterListsByMembership,
  membershipSummariesForClient,
} from "~/server/lib/filterListsByMembership";
import type { AccountMembershipRow } from "~/server/lib/accountMembership";

function membership(
  overrides: Partial<AccountMembershipRow> & Pick<AccountMembershipRow, "accountId">,
): AccountMembershipRow {
  return {
    userId: 1,
    canViewBudgets: true,
    canInviteUsers: false,
    canManageMembers: false,
    allowedBudgetIds: null,
    allowedAccountRegisterIds: null,
    ...overrides,
  };
}

describe("filterListsByMembership", () => {
  const acc = "a1";

  it("keeps categories unchanged when membership allows; drops when canViewBudgets false", () => {
    const data = {
      accounts: [{ id: acc }],
      budgets: [{ id: 1, accountId: acc }],
      accountRegisters: [{ id: 10, accountId: acc, budgetId: 1 }],
      categories: [{ accountId: acc, name: "c" }],
      reoccurrences: [{ accountId: acc, accountRegisterId: 10 }],
      savingsGoals: [
        {
          accountId: acc,
          budgetId: 1,
          sourceAccountRegisterId: 10,
          targetAccountRegisterId: 10,
        },
      ],
    };
    const ok = filterListsByMembership([membership({ accountId: acc })], data);
    expect(ok.categories).toEqual(data.categories);

    const noBudget = filterListsByMembership(
      [membership({ accountId: acc, canViewBudgets: false })],
      data,
    );
    expect(noBudget.categories).toEqual([]);
  });

  it("allowedAccountRegisterIds null keeps all registers under allowed budgets", () => {
    const data = {
      accounts: [{ id: acc }],
      budgets: [{ id: 1, accountId: acc }],
      accountRegisters: [
        { id: 10, accountId: acc, budgetId: 1 },
        { id: 11, accountId: acc, budgetId: 1 },
      ],
      categories: [],
      reoccurrences: [
        { accountId: acc, accountRegisterId: 10 },
        { accountId: acc, accountRegisterId: 11 },
      ],
      savingsGoals: [] as Array<{
        accountId: string;
        budgetId: number;
        sourceAccountRegisterId: number;
        targetAccountRegisterId: number;
      }>,
    };
    const out = filterListsByMembership([membership({ accountId: acc })], data);
    expect(out.accountRegisters.map((r) => r.id).sort()).toEqual([10, 11]);
    expect(out.reoccurrences.length).toBe(2);
  });

  it("hides budget when no visible register intersects that budget", () => {
    const data = {
      accounts: [{ id: acc }],
      budgets: [
        { id: 1, accountId: acc },
        { id: 2, accountId: acc },
      ],
      accountRegisters: [{ id: 10, accountId: acc, budgetId: 1 }],
      categories: [],
      reoccurrences: [],
      savingsGoals: [] as Array<{
        accountId: string;
        budgetId: number;
        sourceAccountRegisterId: number;
        targetAccountRegisterId: number;
      }>,
    };
    const out = filterListsByMembership(
      [
        membership({
          accountId: acc,
          allowedAccountRegisterIds: [10],
        }),
      ],
      data,
    );
    expect(out.budgets.map((b) => b.id)).toEqual([1]);
  });

  it("drops savings goal when source or target register is excluded", () => {
    const data = {
      accounts: [{ id: acc }],
      budgets: [{ id: 1, accountId: acc }],
      accountRegisters: [
        { id: 10, accountId: acc, budgetId: 1 },
        { id: 11, accountId: acc, budgetId: 1 },
      ],
      categories: [],
      reoccurrences: [],
      savingsGoals: [
        {
          accountId: acc,
          budgetId: 1,
          sourceAccountRegisterId: 10,
          targetAccountRegisterId: 11,
        },
      ],
    };
    const full = filterListsByMembership([membership({ accountId: acc })], data);
    expect(full.savingsGoals).toHaveLength(1);

    const restricted = filterListsByMembership(
      [
        membership({
          accountId: acc,
          allowedAccountRegisterIds: [10],
        }),
      ],
      data,
    );
    expect(restricted.savingsGoals).toHaveLength(0);
  });

  it("filters accounts to membership account ids only", () => {
    const data = {
      accounts: [{ id: acc }, { id: "other" }],
      budgets: [],
      accountRegisters: [],
      categories: [],
      reoccurrences: [],
      savingsGoals: [] as Array<{
        accountId: string;
        budgetId: number;
        sourceAccountRegisterId: number;
        targetAccountRegisterId: number;
      }>,
    };
    const out = filterListsByMembership([membership({ accountId: acc })], data);
    expect(out.accounts.map((a) => a.id)).toEqual([acc]);
  });
});

describe("membershipSummariesForClient", () => {
  it("parses allowed ids into sorted unique arrays", () => {
    const rows: AccountMembershipRow[] = [
      {
        userId: 1,
        accountId: "x",
        canViewBudgets: true,
        canInviteUsers: true,
        canManageMembers: false,
        allowedBudgetIds: [3, 1, 3],
        allowedAccountRegisterIds: ["5", 2] as unknown as null,
      },
    ];
    expect(membershipSummariesForClient(rows)).toEqual([
      {
        accountId: "x",
        canViewBudgets: true,
        canInviteUsers: true,
        canManageMembers: false,
        allowedBudgetIds: [1, 3],
        allowedAccountRegisterIds: [2, 5],
      },
    ]);
  });
});
