import { createError } from "h3";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { budgetWhereForAccountMember } from "~/server/lib/accountAccess";
import {
  applyReoccurrenceAmountAdjustment,
  computeFirstNextOccurrenceDate,
  countCompletedAdjustmentSteps,
} from "~/server/services/forecast/reoccurrenceIntervals";
import { dateTimeService } from "~/server/services/forecast";

type BillKind = "BILL" | "INCOME" | "TRANSFER";
type BillStatus =
  | "UPCOMING"
  | "DUE_SOON"
  | "DUE_TODAY"
  | "OVERDUE"
  | "PAID"
  | "SKIPPED"
  | "PARTIAL";

type BillInstanceRow = {
  id: number;
  billProfileId: number;
  accountRegisterId: number;
  dueAt: Date;
  amount: number;
  status: BillStatus;
  paidAt?: Date | null;
  paidAmount?: number | null;
  note?: string | null;
  billProfile: {
    id: number;
    kind: BillKind;
    payee: string | null;
    isAutoPay: boolean;
    graceDays: number;
    expectedAmountLow: number | null;
    expectedAmountHigh: number | null;
    reminderDaysBefore: string | null;
    priority: number;
    reoccurrenceId: number;
    register: { id: number; name: string; latestBalance: number };
    reoccurrence: {
      description: string;
      amount: number;
    };
  };
};

type PrismaBillBridge = {
  billProfile: {
    upsert(
      _args: unknown,
    ): Promise<{ id: number; reminderDaysBefore: string | null }>;
    findMany(
      _args: unknown,
    ): Promise<Array<{ id: number; reoccurrenceId: number }>>;
    update(_args: unknown): Promise<unknown>;
  };
  billInstance: {
    upsert(_args: unknown): Promise<unknown>;
    findMany(_args: unknown): Promise<BillInstanceRow[]>;
    findFirst(_args: unknown): Promise<BillInstanceRow | null>;
    update(_args: unknown): Promise<BillInstanceRow>;
    updateMany(_args: unknown): Promise<unknown>;
  };
};

const prismaBill = PrismaDb as unknown as PrismaBillBridge;

function parseReminderDays(raw: string | null | undefined): number[] {
  if (!raw) return [7, 3, 1];
  const out = raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => b - a);
  return out.length > 0 ? out : [7, 3, 1];
}

function deriveDueStatus(dueAt: Date, reminderDays: number[]): BillStatus {
  const today = dateTimeService.startOf("day", dateTimeService.now().utc());
  const due = dateTimeService.startOf("day", dueAt);
  const daysUntil = Math.floor(dateTimeService.diff(due, today, "days"));
  if (daysUntil < 0) return "OVERDUE";
  if (daysUntil === 0) return "DUE_TODAY";
  if (daysUntil <= (reminderDays[0] ?? 1)) return "DUE_SOON";
  return "UPCOMING";
}

function defaultBillKind(transferAccountRegisterId?: number | null): BillKind {
  if (transferAccountRegisterId != null) return "TRANSFER";
  return "BILL";
}

function toDateKey(date: Date): string {
  return dateTimeService.toDate(date).toISOString().slice(0, 10);
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

export async function syncBillCenter(params: {
  userId: number;
  budgetId: number;
  horizonDays?: number;
}) {
  const horizonDays = Math.max(7, Math.min(365, params.horizonDays ?? 90));
  const budget = await assertBudgetAccess(params.userId, params.budgetId);
  const horizonAt = dateTimeService
    .startOf("day", dateTimeService.now().utc())
    .add({ day: horizonDays })
    .toDate();

  const [intervals, recurring] = await Promise.all([
    PrismaDb.interval.findMany({
      select: { id: true, name: true },
    }),
    PrismaDb.reoccurrence.findMany({
      where: {
        accountId: budget.accountId,
        register: {
          budgetId: params.budgetId,
          account: { userAccounts: { some: { userId: params.userId } } },
        },
      },
      include: {
        register: {
          select: { id: true, name: true, latestBalance: true },
        },
      },
    }),
  ]);
  const intervalNameById = new Map(intervals.map((i) => [i.id, i.name]));

  async function upsertOccurrencesAlongHorizon(
    rec: (typeof recurring)[number],
    profile: { id: number; reminderDaysBefore: string | null },
    due: Date,
    horizonAt: Date,
    intervalName: string | undefined,
  ): Promise<void> {
    let cursor: Date | null = due;
    const reminderDays = parseReminderDays(profile.reminderDaysBefore);
    let guard = 0;
    while (cursor && cursor <= horizonAt && guard < 48) {
      guard += 1;
      const dueKey = toDateKey(cursor);
      const completedSteps =
        rec.amountAdjustmentMode === "NONE" || !rec.amountAdjustmentAnchorAt
          ? 0
          : countCompletedAdjustmentSteps({
              anchor: rec.amountAdjustmentAnchorAt,
              occurrenceDate: cursor,
              adjustmentIntervalId:
                rec.amountAdjustmentIntervalId ?? rec.intervalId,
              adjustmentIntervalCount:
                rec.amountAdjustmentIntervalCount ?? rec.intervalCount,
              adjustmentIntervalName: intervalNameById.get(
                rec.amountAdjustmentIntervalId ?? rec.intervalId,
              ),
            });
      const amount = applyReoccurrenceAmountAdjustment(
        Number(rec.amount),
        rec.amountAdjustmentMode ?? "NONE",
        rec.amountAdjustmentDirection,
        rec.amountAdjustmentValue == null
          ? null
          : Number(rec.amountAdjustmentValue),
        completedSteps,
      );
      const computedStatus = deriveDueStatus(cursor, reminderDays);

      await prismaBill.billInstance.upsert({
        where: {
          billProfileId_dueAt: {
            billProfileId: profile.id,
            dueAt: dateTimeService.startOf("day", cursor).toDate(),
          },
        },
        create: {
          accountId: rec.accountId,
          budgetId: params.budgetId,
          accountRegisterId: rec.accountRegisterId,
          reoccurrenceId: rec.id,
          billProfileId: profile.id,
          dueAt: dateTimeService.startOf("day", cursor).toDate(),
          amount,
          status: computedStatus,
        },
        update: {
          amount,
          status: computedStatus,
          updatedAt: dateTimeService.toDate(),
        },
      });

      const next = computeFirstNextOccurrenceDate({
        lastAt: cursor,
        intervalId: rec.intervalId,
        intervalCount: rec.intervalCount,
        intervalName,
      });
      if (!next || toDateKey(next) === dueKey) break;
      cursor = next;
    }
  }

  async function syncReoccurrence(
    rec: (typeof recurring)[number],
  ): Promise<void> {
    const profile = await prismaBill.billProfile.upsert({
      where: { reoccurrenceId: rec.id },
      create: {
        accountId: rec.accountId,
        budgetId: params.budgetId,
        accountRegisterId: rec.accountRegisterId,
        reoccurrenceId: rec.id,
        kind: defaultBillKind(rec.transferAccountRegisterId),
        payee: rec.description,
        reminderDaysBefore: "7,3,1",
      },
      update: {
        accountId: rec.accountId,
        budgetId: params.budgetId,
        accountRegisterId: rec.accountRegisterId,
      },
      select: { id: true, reminderDaysBefore: true },
    });

    if (!rec.lastAt) return;

    const intervalName = intervalNameById.get(rec.intervalId);
    let due = computeFirstNextOccurrenceDate({
      lastAt: rec.lastAt,
      intervalId: rec.intervalId,
      intervalCount: rec.intervalCount,
      intervalName,
    });

    // One-time schedule fallback if next date is null.
    if (!due) {
      if (rec.lastAt <= horizonAt) {
        due = rec.lastAt;
      } else {
        return;
      }
    }

    await upsertOccurrencesAlongHorizon(
      rec,
      profile,
      due,
      horizonAt,
      intervalName,
    );
  }

  for (const rec of recurring) {
    await syncReoccurrence(rec);
  }
}

export async function getBillCenterSnapshot(params: {
  userId: number;
  budgetId: number;
  from?: string;
  to?: string;
  includeIncome?: boolean;
}) {
  await syncBillCenter({
    userId: params.userId,
    budgetId: params.budgetId,
    horizonDays: 120,
  });
  const fromAt = params.from
    ? dateTimeService.startOf("day", params.from).toDate()
    : dateTimeService.startOf("day", dateTimeService.now().utc()).toDate();
  const toAt = params.to
    ? dateTimeService.endOf("day", params.to).toDate()
    : dateTimeService
        .startOf("day", dateTimeService.now().utc())
        .add({ day: 120 })
        .toDate();

  const rows = await prismaBill.billInstance.findMany({
    where: {
      budgetId: params.budgetId,
      dueAt: { gte: fromAt, lte: toAt },
      billProfile: {
        isArchived: false,
        ...(params.includeIncome ? {} : { kind: { not: "INCOME" } }),
      },
      account: {
        userAccounts: { some: { userId: params.userId } },
      },
    },
    include: {
      billProfile: {
        include: {
          register: {
            select: { id: true, name: true, latestBalance: true },
          },
          reoccurrence: {
            select: { description: true, amount: true },
          },
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  });

  const grouped = {
    overdue: 0,
    dueSoon: 0,
    dueToday: 0,
    upcoming: 0,
    paid: 0,
    skipped: 0,
    partial: 0,
  };
  for (const row of rows) {
    if (row.status === "OVERDUE") grouped.overdue += 1;
    else if (row.status === "DUE_SOON") grouped.dueSoon += 1;
    else if (row.status === "DUE_TODAY") grouped.dueToday += 1;
    else if (row.status === "UPCOMING") grouped.upcoming += 1;
    else if (row.status === "PAID") grouped.paid += 1;
    else if (row.status === "SKIPPED") grouped.skipped += 1;
    else if (row.status === "PARTIAL") grouped.partial += 1;
  }

  return {
    items: rows.map((row) => {
      const projectedBalanceAfter =
        row.billProfile.kind === "INCOME"
          ? Number(row.billProfile.register.latestBalance) + Number(row.amount)
          : Number(row.billProfile.register.latestBalance) - Number(row.amount);
      const isAmountOutOfExpectedRange =
        (row.billProfile.expectedAmountLow != null &&
          Number(row.amount) < Number(row.billProfile.expectedAmountLow)) ||
        (row.billProfile.expectedAmountHigh != null &&
          Number(row.amount) > Number(row.billProfile.expectedAmountHigh));
      return {
        id: row.id,
        status: row.status,
        dueAt: row.dueAt,
        amount: Number(row.amount),
        paidAt: row.paidAt ?? null,
        paidAmount: row.paidAmount == null ? null : Number(row.paidAmount),
        note: row.note ?? null,
        projectedBalanceAfter,
        isAmountOutOfExpectedRange,
        profile: {
          id: row.billProfile.id,
          kind: row.billProfile.kind,
          payee: row.billProfile.payee,
          isAutoPay: row.billProfile.isAutoPay,
          graceDays: row.billProfile.graceDays,
          reminderDaysBefore: row.billProfile.reminderDaysBefore,
          priority: row.billProfile.priority,
          reoccurrenceId: row.billProfile.reoccurrenceId,
          register: row.billProfile.register,
          description: row.billProfile.reoccurrence.description,
          baseAmount: Number(row.billProfile.reoccurrence.amount),
        },
      };
    }),
    counts: grouped,
  };
}

export async function updateBillInstanceStatus(params: {
  userId: number;
  billInstanceId: number;
  status: BillStatus;
  note?: string | null;
  paidAmount?: number | null;
  paidRegisterEntryId?: string | null;
}) {
  const instance = await prismaBill.billInstance.findFirst({
    where: {
      id: params.billInstanceId,
      account: {
        userAccounts: { some: { userId: params.userId } },
      },
    },
  });
  if (!instance) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bill instance not found",
    });
  }

  const now = dateTimeService.toDate();
  return prismaBill.billInstance.update({
    where: { id: params.billInstanceId },
    data: {
      status: params.status,
      note: params.note ?? null,
      paidAt:
        params.status === "PAID" || params.status === "PARTIAL" ? now : null,
      paidAmount:
        params.status === "PAID" || params.status === "PARTIAL"
          ? (params.paidAmount ?? Number(instance.amount))
          : null,
      paidRegisterEntryId:
        params.status === "PAID" || params.status === "PARTIAL"
          ? (params.paidRegisterEntryId ?? null)
          : null,
    },
  });
}

export async function updateBillProfile(params: {
  userId: number;
  billProfileId: number;
  kind?: BillKind;
  payee?: string | null;
  isAutoPay?: boolean;
  graceDays?: number;
  expectedAmountLow?: number | null;
  expectedAmountHigh?: number | null;
  reminderDaysBefore?: string | null;
  priority?: number;
}) {
  const existing = await prismaBill.billProfile.findMany({
    where: {
      id: params.billProfileId,
      account: {
        userAccounts: { some: { userId: params.userId } },
      },
    },
    take: 1,
  });
  if (!existing[0]) {
    throw createError({
      statusCode: 404,
      statusMessage: "Bill profile not found",
    });
  }
  const updateData: Record<string, unknown> = {};
  if (params.kind) updateData.kind = params.kind;
  if (params.payee !== undefined) updateData.payee = params.payee;
  if (params.isAutoPay !== undefined) updateData.isAutoPay = params.isAutoPay;
  if (params.graceDays !== undefined) {
    updateData.graceDays = Math.max(0, params.graceDays);
  }
  if (params.expectedAmountLow !== undefined) {
    updateData.expectedAmountLow = params.expectedAmountLow;
  }
  if (params.expectedAmountHigh !== undefined) {
    updateData.expectedAmountHigh = params.expectedAmountHigh;
  }
  if (params.reminderDaysBefore !== undefined) {
    updateData.reminderDaysBefore = params.reminderDaysBefore;
  }
  if (params.priority !== undefined) updateData.priority = params.priority;

  return prismaBill.billProfile.update({
    where: { id: params.billProfileId },
    data: updateData,
  });
}

export async function evaluateBillReminders(params: {
  userId: number;
  budgetId: number;
}) {
  const snapshot = await getBillCenterSnapshot({
    userId: params.userId,
    budgetId: params.budgetId,
  });
  const reminderCandidates = snapshot.items.filter(
    (item) =>
      item.status === "OVERDUE" ||
      item.status === "DUE_TODAY" ||
      item.status === "DUE_SOON",
  );
  const ids = reminderCandidates.map((item) => item.id);
  if (ids.length > 0) {
    await prismaBill.billInstance.updateMany({
      where: { id: { in: ids } },
      data: { reminderLastSentAt: dateTimeService.toDate() },
    });
  }
  return {
    remindedCount: ids.length,
    overdueCount: snapshot.counts.overdue,
    dueSoonCount: snapshot.counts.dueSoon + snapshot.counts.dueToday,
  };
}

export async function evaluateBillRemindersForAllBudgets() {
  const budgets = await PrismaDb.budget.findMany({
    where: {
      isArchived: false,
      account: {
        isArchived: false,
        userAccounts: {
          some: {},
        },
      },
    },
    select: {
      id: true,
      account: {
        select: {
          userAccounts: {
            select: { userId: true },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  const results: Array<{
    budgetId: number;
    userId: number;
    remindedCount: number;
    overdueCount: number;
    dueSoonCount: number;
  }> = [];
  const failures: Array<{ budgetId: number; error: string }> = [];

  for (const budget of budgets) {
    const userId = budget.account.userAccounts[0]?.userId;
    if (!userId) continue;
    try {
      const result = await evaluateBillReminders({
        userId,
        budgetId: budget.id,
      });
      results.push({
        budgetId: budget.id,
        userId,
        remindedCount: result.remindedCount,
        overdueCount: result.overdueCount,
        dueSoonCount: result.dueSoonCount,
      });
    } catch (error) {
      failures.push({
        budgetId: budget.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    budgetCount: budgets.length,
    processedCount: results.length,
    results,
    failures,
  };
}
