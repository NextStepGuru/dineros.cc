import { createError } from "h3";
import { createId } from "@paralleldrive/cuid2";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import {
  budgetWhereForAccountMember,
  accountWhereUserIsMember,
} from "~/server/lib/accountAccess";
import { dateTimeService } from "~/server/services/forecast";

type ReconciliationPeriodStatus = "OPEN" | "CLOSED";

type ReconciliationPeriodRow = {
  id: number;
  accountId: string;
  budgetId: number;
  accountRegisterId: number;
  status: ReconciliationPeriodStatus;
  startDate: Date;
  endDate: Date;
  statementEndingBalance: number;
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
  };
};

type PrismaReconciliationBridge = {
  reconciliationPeriod: {
    create(_args: unknown): Promise<ReconciliationPeriodRow>;
    findFirst(_args: unknown): Promise<ReconciliationPeriodRow | null>;
    findMany(_args: unknown): Promise<ReconciliationPeriodRow[]>;
    update(_args: unknown): Promise<ReconciliationPeriodRow>;
  };
  reconciliationItem: {
    createMany(_args: unknown): Promise<unknown>;
    findMany(_args: unknown): Promise<ReconciliationItemRow[]>;
    findFirst(_args: unknown): Promise<ReconciliationItemRow | null>;
    update(_args: unknown): Promise<ReconciliationItemRow>;
  };
};

const prismaRecon = PrismaDb as unknown as PrismaReconciliationBridge;

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

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

export async function openReconciliationPeriod(params: {
  userId: number;
  budgetId: number;
  accountRegisterId: number;
  startDate: string;
  endDate: string;
  statementEndingBalance: number;
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
      statementEndingBalance: params.statementEndingBalance,
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

  return period;
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
        },
      },
    },
    orderBy: [
      { registerEntry: { createdAt: "asc" } },
      { registerEntryId: "asc" },
    ],
  });

  const clearedTotal = roundCents(
    items
      .filter((i) => i.isCleared)
      .reduce((sum, i) => sum + Number(i.registerEntry.amount), 0),
  );
  const difference = roundCents(
    Number(period.statementEndingBalance) - clearedTotal,
  );

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

  return {
    period: {
      ...period,
      statementEndingBalance: Number(period.statementEndingBalance),
      ledgerClearedBalance: clearedTotal,
      differenceAmount: difference,
    },
    items: items.map((item) => ({
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
      },
    })),
    discrepancyHints: {
      hasDifference: Math.abs(difference) > 0.009,
      nearMatchEntryId: nearMatch?.registerEntryId ?? null,
      possibleSignMismatchCount: sameSign.length,
    },
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

export async function updateReconciliationItem(params: {
  userId: number;
  registerEntryId: string;
  isCleared?: boolean;
  note?: string | null;
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
        select: { id: true, isReconciled: true },
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

  await PrismaDb.registerEntry.update({
    where: { id: item.registerEntry.id },
    data: {
      isCleared: nextIsCleared,
      isPending: nextIsCleared || item.registerEntry.isReconciled,
    },
  });

  return updated;
}

export async function closeReconciliationPeriod(params: {
  userId: number;
  periodId: number;
  closeNote?: string | null;
  createAdjustmentEntry?: boolean;
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

  const difference = roundCents(period.differenceAmount);
  let adjustmentEntryId: string | null = null;
  if (Math.abs(difference) > 0.009) {
    if (!params.createAdjustmentEntry) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "Difference must be zero before closing, or create an adjustment entry.",
      });
    }
    const adjustment = await PrismaDb.registerEntry.create({
      data: {
        id: createId(),
        accountRegisterId: period.accountRegisterId,
        createdAt: dateTimeService.toDate(period.endDate),
        description: "Reconciliation adjustment",
        amount: difference,
        balance: 0,
        isProjected: false,
        isReconciled: true,
        isCleared: true,
        isPending: true,
        isBalanceEntry: false,
        isManualEntry: true,
        hasBalanceReCalc: true,
      },
      select: { id: true },
    });
    adjustmentEntryId = adjustment.id;
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
      closingAdjustmentEntryId: adjustmentEntryId,
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
