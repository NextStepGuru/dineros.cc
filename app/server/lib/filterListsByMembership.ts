import type { AccountMembershipRow } from "~/server/lib/accountMembership";
import {
  budgetAllowedForMembership,
  parseAllowedBudgetIds,
} from "~/server/lib/accountMembership";

function membershipMap(
  rows: AccountMembershipRow[],
): Map<string, AccountMembershipRow> {
  return new Map(rows.map((r) => [r.accountId, r]));
}

export function filterListsByMembership<
  TRec extends { accountId: string; accountRegisterId: number },
  TBudget extends { id: number; accountId: string },
  TReg extends { id: number; accountId: string; budgetId: number },
  TCat extends { accountId: string },
  TSav extends { accountId: string; budgetId: number },
  TAcc extends { id: string },
>(memberships: AccountMembershipRow[], data: {
  reoccurrences: TRec[];
  budgets: TBudget[];
  accountRegisters: TReg[];
  categories: TCat[];
  savingsGoals: TSav[];
  accounts: TAcc[];
}): {
  reoccurrences: TRec[];
  budgets: TBudget[];
  accountRegisters: TReg[];
  categories: TCat[];
  savingsGoals: TSav[];
  accounts: TAcc[];
} {
  const m = membershipMap(memberships);
  const accountIdSet = new Set(memberships.map((x) => x.accountId));

  const budgets = data.budgets.filter((b) => {
    const row = m.get(b.accountId);
    return row ? budgetAllowedForMembership(row, b.id) : false;
  });
  const visibleBudgetIds = new Set(budgets.map((b) => b.id));

  const regByIdFull = new Map(data.accountRegisters.map((r) => [r.id, r]));

  const reoccurrences = data.reoccurrences.filter((rec) => {
    const reg = regByIdFull.get(rec.accountRegisterId);
    if (!reg) return false;
    const row = m.get(rec.accountId);
    return row ? budgetAllowedForMembership(row, reg.budgetId) : false;
  });

  const accountRegisters = data.accountRegisters.filter(
    (ar) => visibleBudgetIds.has(ar.budgetId) && accountIdSet.has(ar.accountId),
  );

  const categories = data.categories.filter((c) => {
    const row = m.get(c.accountId);
    return !!row?.canViewBudgets;
  });

  const savingsGoals = data.savingsGoals.filter((s) => {
    const row = m.get(s.accountId);
    return row ? budgetAllowedForMembership(row, s.budgetId) : false;
  });

  const accounts = data.accounts.filter((a) => accountIdSet.has(a.id));

  return {
    reoccurrences,
    budgets,
    accountRegisters,
    categories,
    savingsGoals,
    accounts,
  };
}

export function membershipSummariesForClient(
  rows: AccountMembershipRow[],
): Array<{
  accountId: string;
  canViewBudgets: boolean;
  canInviteUsers: boolean;
  canManageMembers: boolean;
  allowedBudgetIds: number[] | null;
}> {
  return rows.map((r) => ({
    accountId: r.accountId,
    canViewBudgets: r.canViewBudgets,
    canInviteUsers: r.canInviteUsers,
    canManageMembers: r.canManageMembers,
    allowedBudgetIds: parseAllowedBudgetIds(r.allowedBudgetIds),
  }));
}
