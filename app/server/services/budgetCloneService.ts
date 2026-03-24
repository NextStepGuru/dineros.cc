import { Prisma } from "@prisma/client";
import type { AccountRegister } from "@prisma/client";
import type { prisma } from "~/server/clients/prismaClient";

type Tx = typeof prisma;

const PLAID_NULL_FIELDS = {
  plaidId: null,
  plaidAccessToken: null,
  plaidAccessTokenHash: null,
  plaidIdHash: null,
  plaidJson: Prisma.JsonNull,
  plaidLastSyncAt: null,
  plaidBalanceLastSyncAt: null,
} as const;

export type CloneBudgetOptions = {
  /** When set (e.g. duplicate to new financial Account), all cloned rows use this `accountId` instead of the source. */
  targetAccountId?: string;
  /** When duplicating to a new Account, map old category UUIDs to new ones; omit for same-account clone. */
  categoryIdMap?: Map<string, string>;
};

function mapCategoryId(
  id: string | null | undefined,
  categoryIdMap: Map<string, string> | undefined,
): string | null {
  if (id == null || id === "") return null;
  if (!categoryIdMap) return id;
  return categoryIdMap.get(id) ?? null;
}

function mustGet<K, V>(map: Map<K, V>, key: K, message: string): V {
  const v = map.get(key);
  if (v === undefined) throw new Error(message);
  return v;
}

/**
 * Topological order: parent before child (by subAccountRegisterId).
 */
function orderRegistersParentBeforeChild<
  T extends { id: number; subAccountRegisterId: number | null },
>(sourceRegisters: T[]): T[] {
  const orderedIds = new Set<number>();
  const orderedRegisters: T[] = [];
  let remaining = [...sourceRegisters];
  while (remaining.length > 0) {
    const next = remaining.filter((r) => {
      const parent = r.subAccountRegisterId;
      return parent == null || orderedIds.has(parent);
    });
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
  return orderedRegisters;
}

/** Map an FK to a cloned register when the referenced register is in the source set; otherwise null. */
function mapRegisterFkIfInSource(
  refId: number | null | undefined,
  sourceRegisterIds: Set<number>,
  registerIdMap: Map<number, number>,
): number | null {
  if (refId == null) return null;
  if (!sourceRegisterIds.has(refId)) return null;
  return registerIdMap.get(refId) ?? null;
}

function mapSubRegisterId(
  subId: number | null | undefined,
  registerIdMap: Map<number, number>,
): number | null {
  if (subId == null) return null;
  return registerIdMap.get(subId) ?? null;
}

function mapOptionalReoccurrenceId(
  id: number | null | undefined,
  reoccurrenceIdMap: Map<number, number>,
): number | null {
  if (id == null) return null;
  return reoccurrenceIdMap.get(id) ?? null;
}

type ReoccurrenceWithRelations = Prisma.ReoccurrenceGetPayload<{
  include: { splits: true; skips: true; plaidNameAliases: true };
}>;

async function cloneAccountRegisterRows(
  tx: Tx,
  orderedRegisters: AccountRegister[],
  sourceRegisterIds: Set<number>,
  targetAccountId: string,
  targetBudgetId: number,
  categoryIdMap: Map<string, string> | undefined,
  registerIdMap: Map<number, number>,
): Promise<void> {
  for (const reg of orderedRegisters) {
    const newSub = mapSubRegisterId(reg.subAccountRegisterId, registerIdMap);
    const newTarget = mapRegisterFkIfInSource(
      reg.targetAccountRegisterId,
      sourceRegisterIds,
      registerIdMap,
    );
    const newCollateral = mapRegisterFkIfInSource(
      reg.collateralAssetRegisterId,
      sourceRegisterIds,
      registerIdMap,
    );

    const created = await tx.accountRegister.create({
      data: {
        accountId: targetAccountId,
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
        paymentCategoryId: mapCategoryId(reg.paymentCategoryId, categoryIdMap),
        interestCategoryId: mapCategoryId(
          reg.interestCategoryId,
          categoryIdMap,
        ),
        depreciationRate: reg.depreciationRate,
        depreciationMethod: reg.depreciationMethod,
        assetOriginalValue: reg.assetOriginalValue,
        assetResidualValue: reg.assetResidualValue,
        assetUsefulLifeYears: reg.assetUsefulLifeYears,
        assetStartAt: reg.assetStartAt,
        vehicleDetails: (
          reg as AccountRegister & { vehicleDetails?: Prisma.JsonValue | null }
        ).vehicleDetails as Prisma.InputJsonValue | null | undefined,
        ...PLAID_NULL_FIELDS,
      },
      select: { id: true },
    });
    registerIdMap.set(reg.id, created.id);
  }
}

async function cloneReoccurrenceRows(
  tx: Tx,
  sourceReoccurrences: ReoccurrenceWithRelations[],
  targetAccountId: string,
  sourceRegisterIds: Set<number>,
  registerIdMap: Map<number, number>,
  categoryIdMap: Map<string, string> | undefined,
  reoccurrenceIdMap: Map<number, number>,
): Promise<void> {
  for (const ro of sourceReoccurrences) {
    const newRegisterId = mustGet(
      registerIdMap,
      ro.accountRegisterId,
      "Budget clone: missing register mapping for reoccurrence",
    );
    const newTransferId = mapRegisterFkIfInSource(
      ro.transferAccountRegisterId,
      sourceRegisterIds,
      registerIdMap,
    );

    const created = await tx.reoccurrence.create({
      data: {
        accountId: targetAccountId,
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
        categoryId: mapCategoryId(ro.categoryId, categoryIdMap),
        amountAdjustmentMode: ro.amountAdjustmentMode,
        amountAdjustmentDirection: ro.amountAdjustmentDirection,
        amountAdjustmentValue: ro.amountAdjustmentValue,
        amountAdjustmentIntervalId: ro.amountAdjustmentIntervalId,
        amountAdjustmentIntervalCount: ro.amountAdjustmentIntervalCount,
        amountAdjustmentAnchorAt: ro.amountAdjustmentAnchorAt,
      },
      select: { id: true },
    });
    reoccurrenceIdMap.set(ro.id, created.id);
  }
}

async function cloneRegisterEntries(
  tx: Tx,
  sourceRegisterIdList: number[],
  registerIdMap: Map<number, number>,
  reoccurrenceIdMap: Map<number, number>,
  sourceRegisterIds: Set<number>,
  categoryIdMap: Map<string, string> | undefined,
): Promise<void> {
  const sourceEntries = await tx.registerEntry.findMany({
    where: { accountRegisterId: { in: sourceRegisterIdList } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (sourceEntries.length === 0) return;

  await tx.registerEntry.createMany({
    data: sourceEntries.map((e) => {
      const newRegisterId = mustGet(
        registerIdMap,
        e.accountRegisterId,
        "Budget clone: missing register mapping for entry",
      );
      const newSourceId = mapRegisterFkIfInSource(
        e.sourceAccountRegisterId,
        sourceRegisterIds,
        registerIdMap,
      );
      const newReoccurrenceId = mapOptionalReoccurrenceId(
        e.reoccurrenceId,
        reoccurrenceIdMap,
      );
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
        plaidJson: Prisma.JsonNull,
        categoryId: mapCategoryId(e.categoryId, categoryIdMap),
        memo: e.memo,
      };
    }),
  });
}

function collectReoccurrenceSplits(
  sourceReoccurrences: ReoccurrenceWithRelations[],
  sourceRegisterIds: Set<number>,
  registerIdMap: Map<number, number>,
  reoccurrenceIdMap: Map<number, number>,
  categoryIdMap: Map<string, string> | undefined,
): Prisma.ReoccurrenceSplitCreateManyInput[] {
  const splitsToCreate: Prisma.ReoccurrenceSplitCreateManyInput[] = [];
  for (const ro of sourceReoccurrences) {
    const newReoccurrenceId = mustGet(
      reoccurrenceIdMap,
      ro.id,
      "Budget clone: missing reoccurrence mapping for split",
    );
    for (const split of ro.splits) {
      const newTransferId = mapRegisterFkIfInSource(
        split.transferAccountRegisterId,
        sourceRegisterIds,
        registerIdMap,
      );
      if (newTransferId != null) {
        splitsToCreate.push({
          reoccurrenceId: newReoccurrenceId,
          transferAccountRegisterId: newTransferId,
          amountMode: split.amountMode ?? "FIXED",
          amount: split.amount,
          description: split.description,
          categoryId: mapCategoryId(split.categoryId, categoryIdMap),
          sortOrder: split.sortOrder,
        });
      }
    }
  }
  return splitsToCreate;
}

type SkipCreateRow = {
  reoccurrenceId: number;
  accountId: string;
  accountRegisterId: number;
  skippedAt: Date | null;
};

function collectReoccurrenceSkips(
  sourceReoccurrences: ReoccurrenceWithRelations[],
  sourceRegisterIds: Set<number>,
  registerIdMap: Map<number, number>,
  reoccurrenceIdMap: Map<number, number>,
  targetAccountId: string,
): SkipCreateRow[] {
  const skipsToCreate: SkipCreateRow[] = [];
  for (const ro of sourceReoccurrences) {
    const newReoccurrenceId = mustGet(
      reoccurrenceIdMap,
      ro.id,
      "Budget clone: missing reoccurrence mapping for skip",
    );
    for (const skip of ro.skips) {
      const newRegisterId = mapRegisterFkIfInSource(
        skip.accountRegisterId,
        sourceRegisterIds,
        registerIdMap,
      );
      if (newRegisterId != null) {
        skipsToCreate.push({
          reoccurrenceId: newReoccurrenceId,
          accountId: targetAccountId,
          accountRegisterId: newRegisterId,
          skippedAt: skip.skippedAt,
        });
      }
    }
  }
  return skipsToCreate;
}

type AliasCreateRow = {
  accountRegisterId: number;
  normalizedName: string;
  reoccurrenceId: number;
};

function collectReoccurrenceAliases(
  sourceReoccurrences: ReoccurrenceWithRelations[],
  registerIdMap: Map<number, number>,
  reoccurrenceIdMap: Map<number, number>,
): AliasCreateRow[] {
  const aliasesToCreate: AliasCreateRow[] = [];
  for (const ro of sourceReoccurrences) {
    const newReoccurrenceId = mustGet(
      reoccurrenceIdMap,
      ro.id,
      "Budget clone: missing reoccurrence mapping for alias",
    );
    const newRegisterId = mustGet(
      registerIdMap,
      ro.accountRegisterId,
      "Budget clone: missing register mapping for alias",
    );
    for (const alias of ro.plaidNameAliases) {
      aliasesToCreate.push({
        accountRegisterId: newRegisterId,
        normalizedName: alias.normalizedName,
        reoccurrenceId: newReoccurrenceId,
      });
    }
  }
  return aliasesToCreate;
}

async function cloneSavingsGoals(
  tx: Tx,
  sourceBudgetId: number,
  targetAccountId: string,
  targetBudgetId: number,
  sourceRegisterIds: Set<number>,
  registerIdMap: Map<number, number>,
  categoryIdMap: Map<string, string> | undefined,
): Promise<void> {
  const sourceGoals = await tx.savingsGoal.findMany({
    where: { budgetId: sourceBudgetId, isArchived: false },
    orderBy: { sortOrder: "asc" },
  });

  for (const g of sourceGoals) {
    const newSourceId = mapRegisterFkIfInSource(
      g.sourceAccountRegisterId,
      sourceRegisterIds,
      registerIdMap,
    );
    const newTargetId = mapRegisterFkIfInSource(
      g.targetAccountRegisterId,
      sourceRegisterIds,
      registerIdMap,
    );
    if (newSourceId == null || newTargetId == null) continue;

    await tx.savingsGoal.create({
      data: {
        accountId: targetAccountId,
        budgetId: targetBudgetId,
        name: g.name,
        targetAmount: g.targetAmount,
        sourceAccountRegisterId: newSourceId,
        targetAccountRegisterId: newTargetId,
        priorityOverDebt: g.priorityOverDebt,
        ignoreMinBalance: g.ignoreMinBalance,
        categoryId: mapCategoryId(g.categoryId, categoryIdMap),
        sortOrder: g.sortOrder,
      },
    });
  }
}

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
  options?: CloneBudgetOptions,
): Promise<void> {
  const targetAccountId = options?.targetAccountId ?? accountId;
  const categoryIdMap = options?.categoryIdMap;

  const sourceRegisters = await tx.accountRegister.findMany({
    where: {
      budgetId: sourceBudgetId,
      accountId: accountId,
      isArchived: false,
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  if (sourceRegisters.length === 0) {
    return;
  }

  const sourceRegisterIds = new Set(sourceRegisters.map((r) => r.id));
  const registerIdMap = new Map<number, number>();
  const reoccurrenceIdMap = new Map<number, number>();

  const orderedRegisters = orderRegistersParentBeforeChild(sourceRegisters);

  await cloneAccountRegisterRows(
    tx,
    orderedRegisters,
    sourceRegisterIds,
    targetAccountId,
    targetBudgetId,
    categoryIdMap,
    registerIdMap,
  );

  const sourceRegisterIdList = [...sourceRegisterIds];
  const sourceReoccurrences = await tx.reoccurrence.findMany({
    where: { accountRegisterId: { in: sourceRegisterIdList } },
    include: { splits: true, skips: true, plaidNameAliases: true },
    orderBy: [{ id: "asc" }],
  });

  await cloneReoccurrenceRows(
    tx,
    sourceReoccurrences,
    targetAccountId,
    sourceRegisterIds,
    registerIdMap,
    categoryIdMap,
    reoccurrenceIdMap,
  );

  await cloneRegisterEntries(
    tx,
    sourceRegisterIdList,
    registerIdMap,
    reoccurrenceIdMap,
    sourceRegisterIds,
    categoryIdMap,
  );

  const splitsToCreate = collectReoccurrenceSplits(
    sourceReoccurrences,
    sourceRegisterIds,
    registerIdMap,
    reoccurrenceIdMap,
    categoryIdMap,
  );
  if (splitsToCreate.length > 0) {
    await tx.reoccurrenceSplit.createMany({ data: splitsToCreate });
  }

  const skipsToCreate = collectReoccurrenceSkips(
    sourceReoccurrences,
    sourceRegisterIds,
    registerIdMap,
    reoccurrenceIdMap,
    targetAccountId,
  );
  if (skipsToCreate.length > 0) {
    await tx.reoccurrenceSkip.createMany({ data: skipsToCreate });
  }

  const aliasesToCreate = collectReoccurrenceAliases(
    sourceReoccurrences,
    registerIdMap,
    reoccurrenceIdMap,
  );
  if (aliasesToCreate.length > 0) {
    await tx.reoccurrencePlaidNameAlias.createMany({ data: aliasesToCreate });
  }

  await cloneSavingsGoals(
    tx,
    sourceBudgetId,
    targetAccountId,
    targetBudgetId,
    sourceRegisterIds,
    registerIdMap,
    categoryIdMap,
  );
}
