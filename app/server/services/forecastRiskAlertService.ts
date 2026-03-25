import { createError } from "h3";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { budgetWhereForAccountMember } from "~/server/lib/accountAccess";
import {
  buildFutureLedgerSorted,
  futureRegisterEntryOr,
  registerBelongsToUserAccountWhere,
  stripRegisterEntryPlaidJson,
} from "~/server/lib/registerLedgerFuture";
import { calculateAdjustedBalance } from "~/lib/calculateAdjustedBalance";
import { dateTimeService } from "~/server/services/forecast";

export type ForecastRiskAlert = {
  key: string;
  accountRegisterId: number;
  accountRegisterName: string;
  riskType: "negative_balance" | "below_min_balance";
  threshold: number;
  projectedBalanceAtRisk: number;
  projectedLowestBalance: number;
  riskAt: string;
  daysUntilRisk: number;
};

type RegisterForRisk = {
  id: number;
  name: string;
  latestBalance: unknown;
  minAccountBalance: unknown;
  type: { isCredit: boolean };
};

type RiskWindow = { now: Date; horizon: Date };

function buildEntriesMap<T extends { accountRegisterId: number }>(entries: T[]) {
  const byRegisterId = new Map<number, T[]>();
  for (const entry of entries) {
    const list = byRegisterId.get(entry.accountRegisterId) ?? [];
    list.push(entry);
    byRegisterId.set(entry.accountRegisterId, list);
  }
  return byRegisterId;
}

function toRiskAlert(params: {
  reg: RegisterForRisk;
  rows: any[];
  window: RiskWindow;
}): ForecastRiskAlert | null {
  const { reg, rows, window } = params;
  if (reg.type.isCredit) return null;

  const threshold = Math.max(0, Number(reg.minAccountBalance ?? 0));
  const riskType: ForecastRiskAlert["riskType"] =
    threshold > 0 ? "below_min_balance" : "negative_balance";

  const ledger = buildFutureLedgerSorted({
    registerEntriesWithoutPlaidJson: rows,
    latestBalance: reg.latestBalance,
    pocketBalances: [],
    isCredit: reg.type.isCredit,
  });

  const fallbackBalance = calculateAdjustedBalance(reg.latestBalance, []);
  const initialRisk = fallbackBalance < threshold;
  let firstRiskAt: Date | null = initialRisk ? window.now : null;
  let firstRiskBalance = fallbackBalance;
  let projectedLowestBalance = fallbackBalance;

  for (const entry of ledger) {
    const withinWindow =
      dateTimeService.isSameOrAfter(entry.createdAt, window.now) &&
      dateTimeService.isSameOrBefore(entry.createdAt, window.horizon);
    if (!withinWindow) continue;
    if (entry.balance < projectedLowestBalance) {
      projectedLowestBalance = entry.balance;
    }
    if (firstRiskAt == null && entry.balance < threshold) {
      firstRiskAt = entry.createdAt;
      firstRiskBalance = entry.balance;
    }
  }

  if (!firstRiskAt) return null;

  const diffMs = firstRiskAt.getTime() - window.now.getTime();
  const daysUntilRisk = Math.max(0, Math.floor(diffMs / 86400000));
  const riskAt = firstRiskAt.toISOString();
  return {
    key: alertKey({
      accountRegisterId: reg.id,
      riskType,
      riskAt,
    }),
    accountRegisterId: reg.id,
    accountRegisterName: reg.name,
    riskType,
    threshold,
    projectedBalanceAtRisk: firstRiskBalance,
    projectedLowestBalance,
    riskAt,
    daysUntilRisk,
  };
}

function sortRiskAlerts(alerts: ForecastRiskAlert[]) {
  alerts.sort((a, b) => {
    if (a.daysUntilRisk !== b.daysUntilRisk) {
      return a.daysUntilRisk - b.daysUntilRisk;
    }
    return a.projectedBalanceAtRisk - b.projectedBalanceAtRisk;
  });
}

function alertKey(params: {
  accountRegisterId: number;
  riskType: ForecastRiskAlert["riskType"];
  riskAt: string;
}) {
  return `${params.accountRegisterId}:${params.riskType}:${params.riskAt.slice(0, 10)}`;
}

export async function evaluateForecastRiskAlerts(params: {
  userId: number;
  budgetId: number;
  daysAhead?: number;
}) {
  const daysAhead = params.daysAhead ?? 90;
  const budget = await PrismaDb.budget.findFirst({
    where: budgetWhereForAccountMember(params.userId, params.budgetId),
    select: { id: true, accountId: true },
  });
  if (!budget) {
    throw createError({
      statusCode: 403,
      statusMessage: "Budget not found or access denied",
    });
  }

  const registers = await PrismaDb.accountRegister.findMany({
    where: {
      accountId: budget.accountId,
      budgetId: params.budgetId,
      isArchived: false,
      subAccountRegisterId: null,
      account: {
        userAccounts: { some: { userId: params.userId } },
      },
    },
    select: {
      id: true,
      name: true,
      latestBalance: true,
      minAccountBalance: true,
      type: { select: { isCredit: true } },
    },
  });

  if (registers.length === 0) {
    return {
      evaluatedAt: dateTimeService.toISOString(),
      daysAhead,
      alerts: [] as ForecastRiskAlert[],
    };
  }

  const registerIds = registers.map((r) => r.id);
  const allEntries = await PrismaDb.registerEntry.findMany({
    where: {
      accountRegisterId: { in: registerIds },
      OR: [...futureRegisterEntryOr],
      ...registerBelongsToUserAccountWhere(budget.accountId, params.userId),
    },
    orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
  });

  const byRegisterId = buildEntriesMap(allEntries);
  const window: RiskWindow = {
    now: dateTimeService.toDate(dateTimeService.startOf("day")),
    horizon: dateTimeService.toDate(
      dateTimeService.endOf("day", dateTimeService.add(daysAhead, "day")),
    ),
  };
  const alerts: ForecastRiskAlert[] = [];

  for (const reg of registers) {
    const rows = stripRegisterEntryPlaidJson(byRegisterId.get(reg.id) ?? []);
    const alert = toRiskAlert({ reg, rows, window });
    if (alert) alerts.push(alert);
  }

  sortRiskAlerts(alerts);
  return {
    evaluatedAt: dateTimeService.toISOString(),
    daysAhead,
    alerts,
  };
}
