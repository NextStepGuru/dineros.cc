import { prisma } from "~/server/clients/prismaClient";

type Tx = typeof prisma;

const PLAID_NULL_FIELDS = {
  plaidId: null,
  plaidAccessToken: null,
  plaidAccessTokenHash: null,
  plaidIdHash: null,
  plaidJson: null,
  plaidLastSyncAt: null,
  plaidBalanceLastSyncAt: null,
} as const;

/**
 * Deep-clone all budget data from source budget into target budget.
 * Runs inside a Prisma transaction. Target budget row must already exist.
 * Clones: AccountRegister, RegisterEntry, Reoccurrence, ReoccurrenceSplit, ReoccurrenceSkip, ReoccurrencePlaidNameAlias.
 * Plaid fields on AccountRegister are nulled on clones. Cross-budget FKs are nulled when target is not in the new set.
 */
export async function cloneBudget(
  tx: Tx,
  sourceBudgetId: number,
  targetBudgetId: number,
  accountId: string,
): Promise<void> {
  const sourceRegisters = await tx.accountRegister.findMany({
    where: { budgetId: sourceBudgetId, accountId, isArchived: false },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  if (sourceRegisters.length === 0) {
    return;
  }

  const sourceRegisterIds = new Set(sourceRegisters.map((r) => r.id));
  const registerIdMap = new Map<number, number>();
  const reoccurrenceIdMap = new Map<number, number>();
  const orderedIds = new Set<number>();

  // Topological order: parent before child (by subAccountRegisterId)
  const orderedRegisters: typeof sourceRegisters = [];
  let remaining = [...sourceRegisters];
  while (remaining.length > 0) {
    const next = remaining.filter(
      (r) =>
        r.subAccountRegisterId == null ||
        orderedIds.has(r.subAccountRegisterId!),
    );
    if (next.length === 0) {
      throw new Error(
        "Budget clone: cycle or parent register missing in source budget",
      );
    }
    for (const r of next) {
      orderedRegisters.push(r);
      orderedIds.add(r.id);
    }
    remaining = remaining.filter((r) => !orderedIds.has(r.id));
  }

  // 1) Clone AccountRegisters
  for (const reg of orderedRegisters) {
    const newSub = reg.subAccountRegisterId
      ? registerIdMap.get(reg.subAccountRegisterId) ?? null
      : null;
    const newTarget = reg.targetAccountRegisterId
      ? sourceRegisterIds.has(reg.targetAccountRegisterId)
        ? registerIdMap.get(reg.targetAccountRegisterId) ?? null
        : null
      : null;
    const newCollateral = reg.collateralAssetRegisterId
      ? sourceRegisterIds.has(reg.collateralAssetRegisterId)
        ? registerIdMap.get(reg.collateralAssetRegisterId) ?? null
        : null
      : null;

    const created = await tx.accountRegister.create({
      data: {
        accountId: reg.accountId,
        budgetId: targetBudgetId,
        typeId: reg.typeId,
        name: reg.name,
        balance: reg.balance,
        creditLimit: reg.creditLimit,
        latestBalance: reg.latestBalance,
        minPayment: reg.minPayment,
        statementAt: reg.statementAt,
        statementIntervalId: reg.statementIntervalId,
        apr1: reg.apr1,
        apr1StartAt: reg.apr1StartAt,
        apr2: reg.apr2,
        apr2StartAt: reg.apr2StartAt,
        apr3: reg.apr3,
        apr3StartAt: reg.apr3StartAt,
        targetAccountRegisterId: newTarget,
        collateralAssetRegisterId: newCollateral,
        loanStartAt: reg.loanStartAt,
        loanPaymentsPerYear: reg.loanPaymentsPerYear,
        loanTotalYears: reg.loanTotalYears,
        loanOriginalAmount: reg.loanOriginalAmount,
        sortOrder: reg.sortOrder,
        loanPaymentSortOrder: reg.loanPaymentSortOrder,
        savingsGoalSortOrder: reg.savingsGoalSortOrder,
        accountSavingsGoal: reg.accountSavingsGoal,
        minAccountBalance: reg.minAccountBalance,
        allowExtraPayment: reg.allowExtraPayment,
        subAccountRegisterId: newSub,
        ...PLAID_NULL_FIELDS,
      },
      select: { id: true },
    });
    registerIdMap.set(reg.id, created.id);
  }

  // 2) Clone Reoccurrences
  const sourceRegisterIdList = [...sourceRegisterIds];
  const sourceReoccurrences = await tx.reoccurrence.findMany({
    where: { accountRegisterId: { in: sourceRegisterIdList } },
    include: { splits: true, skips: true, plaidNameAliases: true },
    orderBy: [{ id: "asc" }],
  });

  for (const ro of sourceReoccurrences) {
    const newRegisterId = registerIdMap.get(ro.accountRegisterId)!;
    const newTransferId = ro.transferAccountRegisterId
      ? sourceRegisterIds.has(ro.transferAccountRegisterId)
        ? registerIdMap.get(ro.transferAccountRegisterId) ?? null
        : null
      : null;

    const created = await tx.reoccurrence.create({
      data: {
        accountId: ro.accountId,
        accountRegisterId: newRegisterId,
        intervalId: ro.intervalId,
        adjustBeforeIfOnWeekend: ro.adjustBeforeIfOnWeekend,
        transferAccountRegisterId: newTransferId,
        intervalCount: ro.intervalCount,
        lastAt: ro.lastAt,
        endAt: ro.endAt,
        totalIntervals: ro.totalIntervals,
        elapsedIntervals: ro.elapsedIntervals,
        amount: ro.amount,
        description: ro.description,
        categoryId: ro.categoryId,
      },
      select: { id: true },
    });
    reoccurrenceIdMap.set(ro.id, created.id);
  }

  // 3) Clone RegisterEntries
  const sourceEntries = await tx.registerEntry.findMany({
    where: { accountRegisterId: { in: sourceRegisterIdList } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (sourceEntries.length > 0) {
    await tx.registerEntry.createMany({
      data: sourceEntries.map((e) => {
        const newRegisterId = registerIdMap.get(e.accountRegisterId)!;
        const newSourceId = e.sourceAccountRegisterId
          ? sourceRegisterIds.has(e.sourceAccountRegisterId)
            ? registerIdMap.get(e.sourceAccountRegisterId) ?? null
            : null
          : null;
        const newReoccurrenceId = e.reoccurrenceId
          ? reoccurrenceIdMap.get(e.reoccurrenceId) ?? null
          : null;
        return {
          accountRegisterId: newRegisterId,
          seq: e.seq,
          sourceAccountRegisterId: newSourceId,
          createdAt: e.createdAt,
          referenceId: e.referenceId,
          checkNo: e.checkNo,
          description: e.description,
          reoccurrenceId: newReoccurrenceId,
          amount: e.amount,
          balance: e.balance,
          typeId: e.typeId,
          isProjected: e.isProjected,
          isReconciled: e.isReconciled,
          isPending: e.isPending,
          isCleared: e.isCleared,
          isMatched: e.isMatched,
          isBalanceEntry: e.isBalanceEntry,
          isManualEntry: e.isManualEntry,
          hasBalanceReCalc: e.hasBalanceReCalc,
          plaidId: null,
          plaidIdHash: null,
          plaidJson: null,
          categoryId: e.categoryId,
          memo: e.memo,
        };
      }),
    });
  }

  // 4) Clone ReoccurrenceSplits
  const splitsToCreate: Array<{
    reoccurrenceId: number;
    transferAccountRegisterId: number;
    amount: unknown;
    description: string | null;
    categoryId: string | null;
    sortOrder: number;
  }> = [];
  for (const ro of sourceReoccurrences) {
    const newReoccurrenceId = reoccurrenceIdMap.get(ro.id)!;
    for (const split of ro.splits) {
      const newTransferId = sourceRegisterIds.has(split.transferAccountRegisterId)
        ? registerIdMap.get(split.transferAccountRegisterId)
        : null;
      if (newTransferId != null) {
        splitsToCreate.push({
          reoccurrenceId: newReoccurrenceId,
          transferAccountRegisterId: newTransferId,
          amount: split.amount,
          description: split.description,
          categoryId: split.categoryId,
          sortOrder: split.sortOrder,
        });
      }
    }
  }
  if (splitsToCreate.length > 0) {
    await tx.reoccurrenceSplit.createMany({ data: splitsToCreate });
  }

  // 5) Clone ReoccurrenceSkips
  const skipsToCreate: Array<{
    reoccurrenceId: number;
    accountId: string;
    accountRegisterId: number;
    skippedAt: Date | null;
  }> = [];
  for (const ro of sourceReoccurrences) {
    const newReoccurrenceId = reoccurrenceIdMap.get(ro.id)!;
    for (const skip of ro.skips) {
      const newRegisterId = sourceRegisterIds.has(skip.accountRegisterId)
        ? registerIdMap.get(skip.accountRegisterId)
        : null;
      if (newRegisterId != null) {
        skipsToCreate.push({
          reoccurrenceId: newReoccurrenceId,
          accountId: skip.accountId,
          accountRegisterId: newRegisterId,
          skippedAt: skip.skippedAt,
        });
      }
    }
  }
  if (skipsToCreate.length > 0) {
    await tx.reoccurrenceSkip.createMany({ data: skipsToCreate });
  }

  // 6) Clone ReoccurrencePlaidNameAlias
  const aliasesToCreate: Array<{
    accountRegisterId: number;
    normalizedName: string;
    reoccurrenceId: number;
  }> = [];
  for (const ro of sourceReoccurrences) {
    const newReoccurrenceId = reoccurrenceIdMap.get(ro.id)!;
    const newRegisterId = registerIdMap.get(ro.accountRegisterId)!;
    for (const alias of ro.plaidNameAliases) {
      aliasesToCreate.push({
        accountRegisterId: newRegisterId,
        normalizedName: alias.normalizedName,
        reoccurrenceId: newReoccurrenceId,
      });
    }
  }
  if (aliasesToCreate.length > 0) {
    await tx.reoccurrencePlaidNameAlias.createMany({ data: aliasesToCreate });
  }

  // 7) Clone SavingsGoals
  const sourceGoals = await tx.savingsGoal.findMany({
    where: { budgetId: sourceBudgetId, isArchived: false },
    orderBy: { sortOrder: "asc" },
  });

  for (const g of sourceGoals) {
    const newSourceId = sourceRegisterIds.has(g.sourceAccountRegisterId)
      ? registerIdMap.get(g.sourceAccountRegisterId)
      : null;
    const newTargetId = sourceRegisterIds.has(g.targetAccountRegisterId)
      ? registerIdMap.get(g.targetAccountRegisterId)
      : null;
    if (newSourceId != null && newTargetId != null) {
      await tx.savingsGoal.create({
        data: {
          accountId: g.accountId,
          budgetId: targetBudgetId,
          name: g.name,
          targetAmount: g.targetAmount,
          sourceAccountRegisterId: newSourceId,
          targetAccountRegisterId: newTargetId,
          priorityOverDebt: g.priorityOverDebt,
          ignoreMinBalance: g.ignoreMinBalance,
          sortOrder: g.sortOrder,
        },
      });
    }
  }
}
