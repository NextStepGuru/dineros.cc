import type { AccountMembershipRow } from "~/server/lib/accountMembership";
import {
  accountRegisterVisibleForMembership,
  budgetAllowedForMembership,
  parseAllowedAccountRegisterIds,
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
  TSav extends {
    accountId: string;
    budgetId: number;
    sourceAccountRegisterId: number;
    targetAccountRegisterId: number;
  },
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

  const regByIdFull = new Map(data.accountRegisters.map((r) => [r.id, r]));

  const budgets = data.budgets.filter((b) => {
    const row = m.get(b.accountId);
    if (!row || !budgetAllowedForMembership(row, b.id)) return false;
    const regPick = parseAllowedAccountRegisterIds(row.allowedAccountRegisterIds);
    if (regPick === null) return true;
    return data.accountRegisters.some(
      (ar) =>
        ar.accountId === b.accountId &&
        ar.budgetId === b.id &&
        regPick.includes(ar.id),
    );
  });

  const reoccurrences = data.reoccurrences.filter((rec) => {
    const reg = regByIdFull.get(rec.accountRegisterId);
    if (!reg) return false;
    const row = m.get(rec.accountId);
    return row ? accountRegisterVisibleForMembership(row, reg) : false;
  });

  const accountRegisters = data.accountRegisters.filter((ar) => {
    const row = m.get(ar.accountId);
    return row ? accountRegisterVisibleForMembership(row, ar) : false;
  });

  const categories = data.categories.filter((c) => {
    const row = m.get(c.accountId);
    return !!row?.canViewBudgets;
  });

  const savingsGoals = data.savingsGoals.filter((s) => {
    const row = m.get(s.accountId);
    if (!row) return false;
    const src = regByIdFull.get(s.sourceAccountRegisterId);
    const tgt = regByIdFull.get(s.targetAccountRegisterId);
    if (!src || !tgt) return false;
    return (
      accountRegisterVisibleForMembership(row, src) &&
      accountRegisterVisibleForMembership(row, tgt)
    );
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
  allowedAccountRegisterIds: number[] | null;
}> {
  return rows.map((r) => ({
    accountId: r.accountId,
    canViewBudgets: r.canViewBudgets,
    canInviteUsers: r.canInviteUsers,
    canManageMembers: r.canManageMembers,
    allowedBudgetIds: parseAllowedBudgetIds(r.allowedBudgetIds),
    allowedAccountRegisterIds: parseAllowedAccountRegisterIds(
      r.allowedAccountRegisterIds,
    ),
  }));
}
