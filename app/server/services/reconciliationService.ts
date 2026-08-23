import { createError } from "h3";
import { createId } from "@paralleldrive/cuid2";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import {
  budgetWhereForAccountMember,
  accountWhereUserIsMember,
} from "~/server/lib/accountAccess";
import { dateTimeService } from "~/server/services/forecast";
import { upsertMerchantCategoryRuleFromUserEdit } from "~/server/services/merchantCategoryRuleService";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { roundToCents } from "~/lib/bankers-rounding";
import {
  amountsMatch,
  reconciliationClearedBalance,
  reconciliationDifference,
} from "~/server/lib/reconciliationMath";
import type { ExtractedStatementLine } from "~/server/services/statementExtractService";
import {
  ledgerOnlyHint,
  loadTransferRecurrenceIds,
  matchStatementLinesForPeriod,
  type ItemRow,
  type StatementMatchStatus,
} from "~/server/services/statementMatchService";

type ReconciliationPeriodStatus = "OPEN" | "CLOSED";

type ReconciliationPeriodRow = {
  id: number;
  accountId: string;
  budgetId: number;
  accountRegisterId: number;
  status: ReconciliationPeriodStatus;
  startDate: Date;
  endDate: Date;
  statementOpeningBalance: number;
  statementEndingBalance: number;
  statementIncomeTotal: number | null;
  statementExpenseTotal: number | null;
  ledgerClearedBalance: number | null;
  differenceAmount: number | null;
  closeNote: string | null;
  closedAt: Date | null;
  closedByUserId: number | null;
  closingAdjustmentEntryId: string | null;
  updatedAt: Date;
  register: { id: number; name: string };
};

type ReconciliationItemRow = {
  id: number;
  reconciliationPeriodId: number;
  registerEntryId: string;
  isCleared: boolean;
  clearedAt: Date | null;
  note: string | null;
  registerEntry: {
    id: string;
    createdAt: Date;
    description: string;
    amount: number;
    balance: number;
    isCleared: boolean;
    isReconciled: boolean;
    isProjected: boolean;
    isPending: boolean;
    reoccurrenceId: number | null;
    sourceAccountRegisterId: number | null;
    categoryId: string | null;
    plaidJson: unknown;
  };
};

type StatementLineDbRow = {
  id: number;
  reconciliationPeriodId: number;
  postedAt: Date;
  description: string;
  amount: number;
  lineType: string | null;
  matchStatus: StatementMatchStatus;
  registerEntryId: string | null;
  matchConfidence: number | null;
  matchReason: string | null;
  ignoredAt: Date | null;
  sortIndex: number;
};

type PrismaReconciliationBridge = {
  reconciliationPeriod: {
    create(_args: unknown): Promise<ReconciliationPeriodRow>;
    findFirst(_args: unknown): Promise<ReconciliationPeriodRow | null>;
    findMany(_args: unknown): Promise<ReconciliationPeriodRow[]>;
    update(_args: unknown): Promise<ReconciliationPeriodRow>;
  };
  reconciliationItem: {
    create(_args: unknown): Promise<ReconciliationItemRow>;
    createMany(_args: unknown): Promise<unknown>;
    findMany(_args: unknown): Promise<ReconciliationItemRow[]>;
    findFirst(_args: unknown): Promise<ReconciliationItemRow | null>;
    update(_args: unknown): Promise<ReconciliationItemRow>;
  };
  statementLine: {
    create(_args: unknown): Promise<StatementLineDbRow>;
    findMany(_args: unknown): Promise<StatementLineDbRow[]>;
    findFirst(_args: unknown): Promise<StatementLineDbRow | null>;
    update(_args: unknown): Promise<StatementLineDbRow>;
    updateMany(_args: unknown): Promise<unknown>;
  };
};

const prismaRecon = PrismaDb as unknown as PrismaReconciliationBridge;

async function assertBudgetAccess(userId: number, budgetId: number) {
  const budget = await PrismaDb.budget.findFirst({
    where: budgetWhereForAccountMember(userId, budgetId),
    select: { id: true, accountId: true },
  });
  if (!budget) {
    throw createError({
      statusCode: 403,
      statusMessage: "Budget not found or access denied",
    });
  }
  return budget;
}

async function assertRegisterAccess(
  userId: number,
  accountRegisterId: number,
  budgetId: number,
) {
  const register = await PrismaDb.accountRegister.findFirst({
    where: {
      id: accountRegisterId,
      budgetId,
      account: accountWhereUserIsMember(userId),
    },
    select: { id: true, name: true, accountId: true, budgetId: true },
  });
  if (!register) {
    throw createError({
      statusCode: 404,
      statusMessage: "Account register not found",
    });
  }
  return register;
}

export async function getLastClosedReconciliationPeriod(params: {
  userId: number;
  budgetId: number;
  accountRegisterId: number;
}) {
  await assertBudgetAccess(params.userId, params.budgetId);
  await assertRegisterAccess(
    params.userId,
    params.accountRegisterId,
    params.budgetId,
  );
  const row = await prismaRecon.reconciliationPeriod.findFirst({
    where: {
      budgetId: params.budgetId,
      accountRegisterId: params.accountRegisterId,
      status: "CLOSED",
    },
    orderBy: { endDate: "desc" },
    include: {
      register: { select: { id: true, name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    endDate: row.endDate,
    statementEndingBalance: Number(row.statementEndingBalance),
  };
}

async function persistStatementLines(params: {
  periodId: number;
  lines: ExtractedStatementLine[];
}): Promise<void> {
  for (let i = 0; i < params.lines.length; i += 1) {
    const line = params.lines[i]!;
    await prismaRecon.statementLine.create({
      data: {
        reconciliationPeriodId: params.periodId,
        postedAt: dateTimeService.parseInput(line.date).toDate(),
        description: line.description.slice(0, 1500),
        amount: roundToCents(line.amount),
        lineType: line.lineType?.slice(0, 64) ?? null,
        matchStatus: "unmatched",
        sortIndex: i,
      },
    });
  }
}

export async function openReconciliationPeriod(params: {
  userId: number;
  budgetId: number;
  accountRegisterId: number;
  startDate: string;
  endDate: string;
  statementOpeningBalance: number;
  statementEndingBalance: number;
  statementIncomeTotal?: number | null;
  statementExpenseTotal?: number | null;
  statementLines?: ExtractedStatementLine[];
}) {
  await assertBudgetAccess(params.userId, params.budgetId);
  const register = await assertRegisterAccess(
    params.userId,
    params.accountRegisterId,
    params.budgetId,
  );

  const existingOpen = await prismaRecon.reconciliationPeriod.findFirst({
    where: {
      budgetId: params.budgetId,
      accountRegisterId: params.accountRegisterId,
      status: "OPEN",
    },
  });
  if (existingOpen) {
    return existingOpen;
  }

  const startDate = dateTimeService.startOf("day", params.startDate).toDate();
  const endDate = dateTimeService.endOf("day", params.endDate).toDate();

  const period = await prismaRecon.reconciliationPeriod.create({
    data: {
      accountId: register.accountId,
      budgetId: params.budgetId,
      accountRegisterId: params.accountRegisterId,
      status: "OPEN",
      startDate,
      endDate,
      statementOpeningBalance: roundToCents(params.statementOpeningBalance),
      statementEndingBalance: roundToCents(params.statementEndingBalance),
      statementIncomeTotal:
        params.statementIncomeTotal == null
          ? null
          : roundToCents(params.statementIncomeTotal),
      statementExpenseTotal:
        params.statementExpenseTotal == null
          ? null
          : roundToCents(params.statementExpenseTotal),
    },
    include: {
      register: { select: { id: true, name: true } },
    },
  });

  const entries = await PrismaDb.registerEntry.findMany({
    where: {
      accountRegisterId: params.accountRegisterId,
      createdAt: { gte: startDate, lte: endDate },
      isBalanceEntry: false,
    },
    select: {
      id: true,
      isCleared: true,
      updatedAt: true,
    },
  });

  if (entries.length > 0) {
    await prismaRecon.reconciliationItem.createMany({
      data: entries.map((entry) => ({
        reconciliationPeriodId: period.id,
        registerEntryId: entry.id,
        isCleared: Boolean(entry.isCleared),
        clearedAt: entry.isCleared ? entry.updatedAt : null,
      })),
      skipDuplicates: true,
    });
  }

  if (params.statementLines && params.statementLines.length > 0) {
    await persistStatementLines({
      periodId: period.id,
      lines: params.statementLines,
    });
    await matchStatementLinesForPeriod({
      periodId: period.id,
      userId: params.userId,
      accountId: register.accountId,
    });
  }

  return period;
}

function mapItem(item: ReconciliationItemRow) {
  return {
    id: item.id,
    reconciliationPeriodId: item.reconciliationPeriodId,
    registerEntryId: item.registerEntryId,
    isCleared: item.isCleared,
    clearedAt: item.clearedAt,
    note: item.note,
    entry: {
      id: item.registerEntry.id,
      createdAt: item.registerEntry.createdAt,
      description: item.registerEntry.description,
      amount: Number(item.registerEntry.amount),
      balance: Number(item.registerEntry.balance),
      isCleared: item.registerEntry.isCleared,
      isReconciled: item.registerEntry.isReconciled,
      isProjected: Boolean(item.registerEntry.isProjected),
      isPending: Boolean(item.registerEntry.isPending),
      categoryId: item.registerEntry.categoryId ?? null,
    },
  };
}

function mapStatementLine(line: StatementLineDbRow) {
  return {
    id: line.id,
    postedAt: line.postedAt,
    description: line.description,
    amount: Number(line.amount),
    lineType: line.lineType,
    matchStatus: line.matchStatus,
    registerEntryId: line.registerEntryId,
    matchConfidence:
      line.matchConfidence == null ? null : Number(line.matchConfidence),
    matchReason: line.matchReason,
    ignoredAt: line.ignoredAt,
  };
}

export async function getReconciliationPeriodWorkspace(params: {
  userId: number;
  periodId: number;
}) {
  const period = await prismaRecon.reconciliationPeriod.findFirst({
    where: {
      id: params.periodId,
      account: {
        userAccounts: { some: { userId: params.userId } },
      },
    },
    include: {
      register: { select: { id: true, name: true } },
    },
  });
  if (!period) {
    throw createError({
      statusCode: 404,
      statusMessage: "Reconciliation period not found",
    });
  }

  const items = await prismaRecon.reconciliationItem.findMany({
    where: { reconciliationPeriodId: period.id },
    include: {
      registerEntry: {
        select: {
          id: true,
          createdAt: true,
          description: true,
          amount: true,
          balance: true,
          isCleared: true,
          isReconciled: true,
          isProjected: true,
          isPending: true,
          reoccurrenceId: true,
          sourceAccountRegisterId: true,
          categoryId: true,
          plaidJson: true,
        },
      },
    },
    orderBy: [
      { registerEntry: { createdAt: "asc" } },
      { registerEntryId: "asc" },
    ],
  });

  const statementLines = await prismaRecon.statementLine.findMany({
    where: { reconciliationPeriodId: period.id },
    orderBy: [{ sortIndex: "asc" }, { id: "asc" }],
  });

  const opening = Number(period.statementOpeningBalance);
  const ending = Number(period.statementEndingBalance);
  const clearedAmountSum = roundToCents(
    items
      .filter((i) => i.isCleared)
      .reduce((sum, i) => sum + Number(i.registerEntry.amount), 0),
  );
  const computedClearedBalance = reconciliationClearedBalance(
    opening,
    clearedAmountSum,
  );
  const difference = reconciliationDifference(ending, opening, clearedAmountSum);

  const sameSign = items.filter(
    (item) =>
      !item.isCleared &&
      Math.sign(Number(item.registerEntry.amount)) === Math.sign(difference),
  );
  const nearMatch = sameSign.find(
    (item) =>
      Math.abs(
        Math.abs(Number(item.registerEntry.amount)) - Math.abs(difference),
      ) <= 2,
  );
  const doubleAmount = items.find(
    (item) =>
      !item.isCleared &&
      amountsMatch(Math.abs(Number(item.registerEntry.amount)) * 2, Math.abs(difference)),
  );

  const lastClosed = await prismaRecon.reconciliationPeriod.findFirst({
    where: {
      accountRegisterId: period.accountRegisterId,
      status: "CLOSED",
      id: { not: period.id },
    },
    orderBy: { endDate: "desc" },
  });
  const previousEnding =
    lastClosed == null ? null : Number(lastClosed.statementEndingBalance);
  const openingContinuity =
    previousEnding == null
      ? null
      : {
          previousEnding,
          expectedOpening: previousEnding,
          matches: amountsMatch(previousEnding, opening),
        };

  const mappedItems = items.map(mapItem);
  const mappedLines = statementLines.map(mapStatementLine);
  const itemByEntryId = new Map(mappedItems.map((item) => [item.registerEntryId, item]));
  const matchedEntryIds = new Set(
    mappedLines
      .filter((line) => line.matchStatus === "matched" && line.registerEntryId)
      .map((line) => line.registerEntryId as string),
  );

  const transferRecurrenceIds = await loadTransferRecurrenceIds(
    items
      .map((item) => item.registerEntry.reoccurrenceId)
      .filter((id): id is number => id != null),
  );

  const matched = mappedLines
    .filter((line) => line.matchStatus === "matched")
    .map((line) => ({
      line,
      item: line.registerEntryId
        ? (itemByEntryId.get(line.registerEntryId) ?? null)
        : null,
    }));
  const statementOnly = mappedLines.filter(
    (line) => line.matchStatus === "statement_only" && !line.ignoredAt,
  );
  const ignored = mappedLines.filter(
    (line) => line.matchStatus === "ignored" || line.ignoredAt,
  );
  const conflicts = mappedLines
    .filter((line) => line.matchStatus === "conflict")
    .map((line) => ({
      line,
      item: line.registerEntryId
        ? (itemByEntryId.get(line.registerEntryId) ?? null)
        : null,
    }));
  const ledgerOnly = mappedItems
    .filter((item) => !item.isCleared && !matchedEntryIds.has(item.registerEntryId))
    .map((item) => {
      const raw = items.find((row) => row.registerEntryId === item.registerEntryId);
      const hint = raw
        ? ledgerOnlyHint({
            item: raw as unknown as ItemRow,
            endDate: period.endDate,
            transferRecurrenceIds,
          })
        : "missing_from_statement";
      return { item, hint };
    });

  const matchedCredits = roundToCents(
    mappedLines
      .filter((line) => line.matchStatus === "matched" && line.amount > 0)
      .reduce((sum, line) => sum + line.amount, 0),
  );
  const matchedDebits = roundToCents(
    mappedLines
      .filter((line) => line.matchStatus === "matched" && line.amount < 0)
      .reduce((sum, line) => sum + line.amount, 0),
  );
  const incomeTotal =
    period.statementIncomeTotal == null
      ? null
      : Number(period.statementIncomeTotal);
  const expenseTotal =
    period.statementExpenseTotal == null
      ? null
      : Number(period.statementExpenseTotal);

  return {
    period: {
      ...period,
      statementOpeningBalance: opening,
      statementEndingBalance: ending,
      statementIncomeTotal: incomeTotal,
      statementExpenseTotal: expenseTotal,
      ledgerClearedBalance: computedClearedBalance,
      clearedAmountSum,
      differenceAmount: difference,
    },
    items: mappedItems,
    statementLines: mappedLines,
    buckets: {
      matched,
      statementOnly,
      ledgerOnly,
      conflicts,
      ignored,
    },
    discrepancyHints: {
      hasDifference: Math.abs(difference) > 0.009,
      nearMatchEntryId: nearMatch?.registerEntryId ?? null,
      possibleSignMismatchCount: sameSign.length,
      possibleWrongSignEntryId: doubleAmount?.registerEntryId ?? null,
      incomeSubtotalDelta:
        incomeTotal == null ? null : roundToCents(incomeTotal - matchedCredits),
      expenseSubtotalDelta:
        expenseTotal == null ? null : roundToCents(expenseTotal - matchedDebits),
    },
    openingContinuity,
  };
}

export async function getOpenReconciliationPeriod(params: {
  userId: number;
  budgetId: number;
  accountRegisterId: number;
}) {
  await assertBudgetAccess(params.userId, params.budgetId);
  await assertRegisterAccess(
    params.userId,
    params.accountRegisterId,
    params.budgetId,
  );
  return prismaRecon.reconciliationPeriod.findFirst({
    where: {
      budgetId: params.budgetId,
      accountRegisterId: params.accountRegisterId,
      status: "OPEN",
    },
    include: {
      register: { select: { id: true, name: true } },
    },
    orderBy: { id: "desc" },
  });
}

export async function getReconciliationSetup(params: {
  userId: number;
  budgetId: number;
  accountRegisterId: number;
}) {
  const [open, lastClosed] = await Promise.all([
    getOpenReconciliationPeriod(params),
    getLastClosedReconciliationPeriod(params),
  ]);
  return { open, lastClosed };
}

export async function rematchReconciliationPeriod(params: {
  userId: number;
  periodId: number;
}) {
  const workspace = await getReconciliationPeriodWorkspace({
    userId: params.userId,
    periodId: params.periodId,
  });
  if (workspace.period.status !== "OPEN") {
    throw createError({
      statusCode: 400,
      statusMessage: "Reconciliation period is already closed",
    });
  }
  await prismaRecon.statementLine.updateMany({
    where: {
      reconciliationPeriodId: params.periodId,
      matchStatus: { in: ["statement_only", "unmatched", "conflict"] },
    },
    data: {
      matchStatus: "unmatched",
      registerEntryId: null,
      matchConfidence: null,
      matchReason: null,
    },
  });
  const result = await matchStatementLinesForPeriod({
    periodId: params.periodId,
    userId: params.userId,
    accountId: workspace.period.accountId,
  });
  return result;
}

export async function updateReconciliationItem(params: {
  userId: number;
  registerEntryId: string;
  isCleared?: boolean;
  note?: string | null;
  categoryId?: string | null;
}) {
  const item = await prismaRecon.reconciliationItem.findFirst({
    where: {
      registerEntryId: params.registerEntryId,
      period: {
        status: "OPEN",
        account: { userAccounts: { some: { userId: params.userId } } },
      },
    },
    include: {
      registerEntry: {
        select: { id: true, isReconciled: true, plaidJson: true },
      },
    },
  });

  if (!item) {
    throw createError({
      statusCode: 404,
      statusMessage: "Open reconciliation item not found",
    });
  }

  const nextIsCleared = params.isCleared ?? item.isCleared;
  const itemUpdateData: {
    isCleared: boolean;
    clearedAt: Date | null;
    note?: string | null;
  } = {
    isCleared: nextIsCleared,
    clearedAt: nextIsCleared ? dateTimeService.toDate() : null,
  };
  if (params.note !== undefined) {
    itemUpdateData.note = params.note;
  }
  const updated = await prismaRecon.reconciliationItem.update({
    where: { id: item.id },
    data: itemUpdateData,
  });

  const entryUpdate: {
    isCleared: boolean;
    isPending: boolean;
    categoryId?: string | null;
    categoryLocked?: boolean;
    categorySource?: string;
  } = {
    isCleared: nextIsCleared,
    isPending: nextIsCleared || item.registerEntry.isReconciled,
  };

  if (params.categoryId !== undefined) {
    const periodRow = await prismaRecon.reconciliationPeriod.findFirst({
      where: { id: item.reconciliationPeriodId },
    });
    if (!periodRow) {
      throw createError({
        statusCode: 404,
        statusMessage: "Reconciliation period not found",
      });
    }
    if (params.categoryId) {
      const category = await PrismaDb.category.findFirst({
        where: {
          id: params.categoryId,
          accountId: periodRow.accountId,
        },
        select: { id: true },
      });
      if (!category) {
        throw createError({
          statusCode: 400,
          statusMessage: "Category not found",
        });
      }
    }
    entryUpdate.categoryId = params.categoryId;
    entryUpdate.categoryLocked = true;
    entryUpdate.categorySource = "user";
    await PrismaDb.registerEntry.update({
      where: { id: item.registerEntry.id },
      data: entryUpdate,
    });
    await upsertMerchantCategoryRuleFromUserEdit({
      accountId: periodRow.accountId,
      categoryId: params.categoryId,
      plaidJson: item.registerEntry.plaidJson,
    });
    return updated;
  }

  await PrismaDb.registerEntry.update({
    where: { id: item.registerEntry.id },
    data: entryUpdate,
  });

  return updated;
}

function canImportStatementLine(line: StatementLineDbRow): boolean {
  if (line.ignoredAt) return false;
  if (line.registerEntryId) return false;
  return (
    line.matchStatus === "statement_only" || line.matchStatus === "unmatched"
  );
}

async function createLedgerEntryForStatementLine(params: {
  line: StatementLineDbRow;
  period: ReconciliationPeriodRow;
}): Promise<{ registerEntryId: string; statementLineId: number }> {
  const entry = await PrismaDb.registerEntry.create({
    data: {
      id: createId(),
      accountRegisterId: params.period.accountRegisterId,
      createdAt: dateTimeService.toDate(params.line.postedAt),
      description: params.line.description.slice(0, 1500),
      amount: roundToCents(Number(params.line.amount)),
      balance: 0,
      isProjected: false,
      isReconciled: false,
      isCleared: true,
      isPending: true,
      isBalanceEntry: false,
      isManualEntry: true,
      hasBalanceReCalc: true,
    },
    select: { id: true },
  });

  await prismaRecon.reconciliationItem.create({
    data: {
      reconciliationPeriodId: params.period.id,
      registerEntryId: entry.id,
      isCleared: true,
      clearedAt: dateTimeService.toDate(),
    },
  });

  await prismaRecon.statementLine.update({
    where: { id: params.line.id },
    data: {
      matchStatus: "matched",
      registerEntryId: entry.id,
      matchConfidence: 1,
      matchReason: "Added to ledger from statement",
      ignoredAt: null,
    },
  });

  return {
    registerEntryId: entry.id,
    statementLineId: params.line.id,
  };
}

export async function updateStatementLine(params: {
  userId: number;
  statementLineId: number;
  ignore?: boolean;
  registerEntryId?: string | null;
  createLedgerEntry?: boolean;
}) {
  const line = await prismaRecon.statementLine.findFirst({
    where: { id: params.statementLineId },
  });
  if (!line) {
    throw createError({
      statusCode: 404,
      statusMessage: "Statement line not found",
    });
  }
  const period = await prismaRecon.reconciliationPeriod.findFirst({
    where: {
      id: line.reconciliationPeriodId,
      account: { userAccounts: { some: { userId: params.userId } } },
    },
  });
  if (!period) {
    throw createError({
      statusCode: 404,
      statusMessage: "Statement line not found",
    });
  }
  if (period.status !== "OPEN") {
    throw createError({
      statusCode: 400,
      statusMessage: "Reconciliation period is already closed",
    });
  }

  if (params.createLedgerEntry) {
    if (!canImportStatementLine(line)) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "This statement line is already matched, ignored, or in conflict.",
      });
    }
    const created = await createLedgerEntryForStatementLine({ line, period });
    addRecalculateJob({ accountId: period.accountId });
    return created;
  }

  if (params.ignore === true) {
    return prismaRecon.statementLine.update({
      where: { id: params.statementLineId },
      data: {
        matchStatus: "ignored",
        ignoredAt: dateTimeService.toDate(),
        matchReason: "Ignored for this period",
      },
    });
  }
  if (params.ignore === false) {
    return prismaRecon.statementLine.update({
      where: { id: params.statementLineId },
      data: {
        matchStatus: "statement_only",
        ignoredAt: null,
        registerEntryId: null,
        matchReason: "No ledger match",
      },
    });
  }

  if (params.registerEntryId === null) {
    const previousEntryId = line.registerEntryId;
    const updated = await prismaRecon.statementLine.update({
      where: { id: params.statementLineId },
      data: {
        matchStatus: "statement_only",
        registerEntryId: null,
        matchConfidence: null,
        matchReason: "Unmatched by user",
      },
    });
    if (previousEntryId) {
      const item = await prismaRecon.reconciliationItem.findFirst({
        where: {
          reconciliationPeriodId: period.id,
          registerEntryId: previousEntryId,
        },
        include: {
          registerEntry: { select: { id: true, isReconciled: true } },
        },
      });
      if (item && item.isCleared && !item.registerEntry.isReconciled) {
        await updateReconciliationItem({
          userId: params.userId,
          registerEntryId: previousEntryId,
          isCleared: false,
        });
      }
    }
    return updated;
  }

  if (params.registerEntryId) {
    const item = await prismaRecon.reconciliationItem.findFirst({
      where: {
        reconciliationPeriodId: period.id,
        registerEntryId: params.registerEntryId,
      },
      include: {
        registerEntry: { select: { id: true, isReconciled: true } },
      },
    });
    if (!item) {
      throw createError({
        statusCode: 404,
        statusMessage: "Ledger entry is not in this period",
      });
    }
    const updated = await prismaRecon.statementLine.update({
      where: { id: params.statementLineId },
      data: {
        matchStatus: "matched",
        registerEntryId: params.registerEntryId,
        matchConfidence: 1,
        matchReason: "Matched by user",
        ignoredAt: null,
      },
    });
    await updateReconciliationItem({
      userId: params.userId,
      registerEntryId: params.registerEntryId,
      isCleared: true,
    });
    return updated;
  }

  return line;
}

export async function importStatementLinesToLedger(params: {
  userId: number;
  periodId: number;
  statementLineIds?: number[];
}) {
  const period = await prismaRecon.reconciliationPeriod.findFirst({
    where: {
      id: params.periodId,
      account: { userAccounts: { some: { userId: params.userId } } },
    },
  });
  if (!period) {
    throw createError({
      statusCode: 404,
      statusMessage: "Reconciliation period not found",
    });
  }
  if (period.status !== "OPEN") {
    throw createError({
      statusCode: 400,
      statusMessage: "Reconciliation period is already closed",
    });
  }

  const lines = await prismaRecon.statementLine.findMany({
    where: { reconciliationPeriodId: period.id },
    orderBy: [{ sortIndex: "asc" }, { id: "asc" }],
  });
  const wanted =
    params.statementLineIds && params.statementLineIds.length > 0
      ? new Set(params.statementLineIds)
      : null;
  const toImport = lines.filter((line) => {
    if (wanted && !wanted.has(line.id)) return false;
    return canImportStatementLine(line);
  });
  if (wanted) {
    const found = new Set(toImport.map((line) => line.id));
    const missing = params.statementLineIds!.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "Some statement lines cannot be added (already matched, ignored, or not in this period).",
      });
    }
  }

  const created: Array<{ registerEntryId: string; statementLineId: number }> =
    [];
  for (const line of toImport) {
    created.push(await createLedgerEntryForStatementLine({ line, period }));
  }
  if (created.length > 0) {
    addRecalculateJob({ accountId: period.accountId });
  }
  return {
    created: created.length,
    registerEntryIds: created.map((c) => c.registerEntryId),
  };
}

export async function closeReconciliationPeriod(params: {
  userId: number;
  periodId: number;
  closeNote?: string | null;
}) {
  const workspace = await getReconciliationPeriodWorkspace({
    userId: params.userId,
    periodId: params.periodId,
  });
  const period = workspace.period;
  if (period.status !== "OPEN") {
    throw createError({
      statusCode: 400,
      statusMessage: "Reconciliation period is already closed",
    });
  }

  const difference = roundToCents(period.differenceAmount);
  if (Math.abs(difference) > 0.009) {
    throw createError({
      statusCode: 400,
      statusMessage: "Difference must be zero before closing.",
    });
  }

  if (workspace.buckets.statementOnly.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Unresolved statement lines remain. Add them to the ledger, match them, or ignore them before closing.",
    });
  }

  const uncategorizedCleared = workspace.items.filter(
    (item) => item.isCleared && !item.entry.categoryId,
  );
  if (uncategorizedCleared.length > 0) {
    const n = uncategorizedCleared.length;
    throw createError({
      statusCode: 400,
      statusMessage:
        n === 1
          ? "1 cleared entry has no category."
          : `${n} cleared entries have no category.`,
    });
  }

  const clearedEntryIds = workspace.items
    .filter((item) => item.isCleared)
    .map((item) => item.registerEntryId);
  if (clearedEntryIds.length > 0) {
    await PrismaDb.registerEntry.updateMany({
      where: { id: { in: clearedEntryIds } },
      data: {
        isCleared: true,
        isReconciled: true,
        isPending: true,
      },
    });
  }

  return prismaRecon.reconciliationPeriod.update({
    where: { id: period.id },
    data: {
      status: "CLOSED",
      closedAt: dateTimeService.toDate(),
      closedByUserId: params.userId,
      closeNote: params.closeNote ?? null,
      ledgerClearedBalance: period.ledgerClearedBalance,
      differenceAmount: difference,
    },
    include: {
      register: { select: { id: true, name: true } },
    },
  });
}

export async function getOpenReconciliationPeriodSummaries(params: {
  userId: number;
  budgetId: number;
}) {
  await assertBudgetAccess(params.userId, params.budgetId);
  const rows = await prismaRecon.reconciliationPeriod.findMany({
    where: {
      budgetId: params.budgetId,
      status: "OPEN",
      account: { userAccounts: { some: { userId: params.userId } } },
    },
    include: {
      register: { select: { id: true, name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    accountRegisterId: row.accountRegisterId,
    accountRegisterName: row.register.name,
    updatedAt: row.updatedAt,
  }));
}
