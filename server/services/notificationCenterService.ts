import { createError } from "h3";
import type { Prisma } from "@prisma/client";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import {
  accountWhereUserIsMember,
  budgetWhereForAccountMember,
} from "~/server/lib/accountAccess";
import {
  evaluateForecastRiskAlerts,
  type ForecastRiskAlert,
} from "~/server/services/forecastRiskAlertService";
import {
  getReoccurrenceHealth,
  type ReoccurrenceHealthIssue,
} from "~/server/services/reoccurrenceHealthService";
import { dateTimeService } from "~/server/services/forecast";

type NotificationKind = "FORECAST_RISK" | "REOCCURRENCE_HEALTH";

type NotificationEventRecord = {
  id: number;
  kind: NotificationKind;
  occurrenceKey: string;
  payload: unknown;
};

type NotificationDismissalRecord = {
  kind: NotificationKind;
  occurrenceKey: string;
};

type PrismaNotificationBridge = {
  notificationDismissal: {
    upsert(_args: unknown): Promise<unknown>;
    findMany(_args: unknown): Promise<NotificationDismissalRecord[]>;
  };
  notificationEvent: {
    upsert(_args: unknown): Promise<unknown>;
    updateMany(_args: unknown): Promise<unknown>;
    findMany(_args: unknown): Promise<NotificationEventRecord[]>;
    findFirst(_args: unknown): Promise<NotificationDismissalRecord | null>;
  };
};

const prismaNotifications = PrismaDb as unknown as PrismaNotificationBridge;

/** Avoid re-reading settings / re-running migration after legacy data is gone or migrated. */
const legacyForecastDismissalMigrationDoneForUser = new Set<number>();

type NotificationSignal = {
  kind: NotificationKind;
  fingerprint: string;
  occurrenceKey: string;
  payload: Record<string, unknown>;
};

export type NotificationSnapshot = {
  riskAlerts: (ForecastRiskAlert & { notificationId: number })[];
  recurringHealthIssues: (ReoccurrenceHealthIssue & {
    notificationId: number;
  })[];
  total: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRiskSignals(alerts: ForecastRiskAlert[]): NotificationSignal[] {
  return alerts.map((alert) => ({
    kind: "FORECAST_RISK",
    fingerprint: `risk:${alert.accountRegisterId}:${alert.riskType}`,
    occurrenceKey: alert.key,
    payload: {
      key: alert.key,
      accountRegisterId: alert.accountRegisterId,
      accountRegisterName: alert.accountRegisterName,
      riskType: alert.riskType,
      threshold: alert.threshold,
      projectedBalanceAtRisk: alert.projectedBalanceAtRisk,
      projectedLowestBalance: alert.projectedLowestBalance,
      riskAt: alert.riskAt,
      daysUntilRisk: alert.daysUntilRisk,
    },
  }));
}

function toRecurringSignals(
  issues: ReoccurrenceHealthIssue[],
): NotificationSignal[] {
  return issues.map((issue) => ({
    kind: "REOCCURRENCE_HEALTH",
    fingerprint: `recurring:${issue.type}:${issue.reoccurrenceId}`,
    occurrenceKey: issue.occurrenceKey,
    payload: {
      type: issue.type,
      reoccurrenceId: issue.reoccurrenceId,
      description: issue.description,
      accountRegisterId: issue.accountRegisterId,
      accountRegisterName: issue.accountRegisterName,
      details: issue.details,
      occurrenceKey: issue.occurrenceKey,
    },
  }));
}

function parseRiskPayload(
  payload: unknown,
  notificationId: number,
  occurrenceKey: string,
): (ForecastRiskAlert & { notificationId: number }) | null {
  if (!isRecord(payload)) return null;
  if (
    typeof payload.accountRegisterId !== "number" ||
    typeof payload.accountRegisterName !== "string" ||
    (payload.riskType !== "negative_balance" &&
      payload.riskType !== "below_min_balance") ||
    typeof payload.threshold !== "number" ||
    typeof payload.projectedBalanceAtRisk !== "number" ||
    typeof payload.projectedLowestBalance !== "number" ||
    typeof payload.riskAt !== "string" ||
    typeof payload.daysUntilRisk !== "number"
  ) {
    return null;
  }
  return {
    notificationId,
    key:
      typeof payload.key === "string" && payload.key.length > 0
        ? payload.key
        : occurrenceKey,
    accountRegisterId: payload.accountRegisterId,
    accountRegisterName: payload.accountRegisterName,
    riskType: payload.riskType,
    threshold: payload.threshold,
    projectedBalanceAtRisk: payload.projectedBalanceAtRisk,
    projectedLowestBalance: payload.projectedLowestBalance,
    riskAt: payload.riskAt,
    daysUntilRisk: payload.daysUntilRisk,
  };
}

function parseRecurringPayload(
  payload: unknown,
  notificationId: number,
  occurrenceKey: string,
): (ReoccurrenceHealthIssue & { notificationId: number }) | null {
  if (!isRecord(payload)) return null;
  if (
    (payload.type !== "duplicate_rule" &&
      payload.type !== "ended_rule" &&
      payload.type !== "last_run_after_end" &&
      payload.type !== "stale_last_run" &&
      payload.type !== "zero_amount") ||
    typeof payload.reoccurrenceId !== "number" ||
    typeof payload.description !== "string" ||
    typeof payload.accountRegisterId !== "number" ||
    typeof payload.accountRegisterName !== "string" ||
    typeof payload.details !== "string"
  ) {
    return null;
  }
  return {
    notificationId,
    type: payload.type,
    reoccurrenceId: payload.reoccurrenceId,
    description: payload.description,
    accountRegisterId: payload.accountRegisterId,
    accountRegisterName: payload.accountRegisterName,
    details: payload.details,
    occurrenceKey:
      typeof payload.occurrenceKey === "string" &&
      payload.occurrenceKey.length > 0
        ? payload.occurrenceKey
        : occurrenceKey,
  };
}

async function ensureBudgetAccess(userId: number, budgetId: number) {
  const budget = await PrismaDb.budget.findFirst({
    where: budgetWhereForAccountMember(userId, budgetId),
    select: { id: true },
  });
  if (!budget) {
    throw createError({
      statusCode: 403,
      statusMessage: "Budget not found or access denied",
    });
  }
}

export async function migrateLegacyForecastDismissals({
  userId,
  budgetId: _budgetId,
}: {
  userId: number;
  budgetId: number;
}) {
  if (legacyForecastDismissalMigrationDoneForUser.has(userId)) {
    return;
  }

  const user = await PrismaDb.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const settings = (user?.settings ?? {}) as Record<string, unknown>;
  const root =
    typeof settings.forecastRiskAlerts === "object" &&
    settings.forecastRiskAlerts !== null
      ? (settings.forecastRiskAlerts as Record<string, unknown>)
      : {};
  const itemsRaw = Array.isArray(root.items) ? root.items : [];
  const entries = itemsRaw.filter((i): i is Record<string, unknown> => {
    return (
      typeof i === "object" &&
      i !== null &&
      typeof (i as Record<string, unknown>).key === "string"
    );
  });
  if (entries.length === 0) {
    legacyForecastDismissalMigrationDoneForUser.add(userId);
    return;
  }

  const budgetRows = await PrismaDb.budget.findMany({
    where: {
      isArchived: false,
      account: accountWhereUserIsMember(userId),
    },
    select: { id: true },
  });
  const budgetIds = budgetRows.map((b) => b.id);

  const occurrenceKeys = entries
    .map((e) => String(e.key))
    .filter((k) => k.length > 0);

  const { items: _legacyItems, ...restForecastRiskAlerts } = root;
  const nextSettings: Record<string, unknown> = { ...settings };
  if (Object.keys(restForecastRiskAlerts).length > 0) {
    nextSettings.forecastRiskAlerts = restForecastRiskAlerts;
  } else {
    delete nextSettings.forecastRiskAlerts;
  }

  await PrismaDb.$transaction(async (tx) => {
    const notify = tx as unknown as PrismaNotificationBridge;
    for (const budgetId of budgetIds) {
      for (const occurrenceKey of occurrenceKeys) {
        await notify.notificationDismissal.upsert({
          where: {
            userId_budgetId_kind_occurrenceKey: {
              userId,
              budgetId,
              kind: "FORECAST_RISK",
              occurrenceKey,
            },
          },
          update: {},
          create: {
            userId,
            budgetId,
            kind: "FORECAST_RISK",
            occurrenceKey,
          },
        });
      }
    }
    await tx.user.update({
      where: { id: userId },
      data: { settings: nextSettings as Prisma.InputJsonValue },
    });
  });

  legacyForecastDismissalMigrationDoneForUser.add(userId);
}

export async function syncNotificationsForBudget(params: {
  userId: number;
  budgetId: number;
  daysAhead?: number;
}) {
  await ensureBudgetAccess(params.userId, params.budgetId);
  await migrateLegacyForecastDismissals({
    userId: params.userId,
    budgetId: params.budgetId,
  });

  const [riskResult, recurringResult] = await Promise.all([
    evaluateForecastRiskAlerts({
      userId: params.userId,
      budgetId: params.budgetId,
      daysAhead: params.daysAhead ?? 90,
    }),
    getReoccurrenceHealth({
      userId: params.userId,
      budgetId: params.budgetId,
    }),
  ]);

  const signals = [
    ...toRiskSignals(riskResult.alerts),
    ...toRecurringSignals(recurringResult.issues),
  ];
  const now = dateTimeService.toDate();

  for (const signal of signals) {
    await prismaNotifications.notificationEvent.upsert({
      where: {
        userId_budgetId_kind_fingerprint: {
          userId: params.userId,
          budgetId: params.budgetId,
          kind: signal.kind,
          fingerprint: signal.fingerprint,
        },
      },
      update: {
        isActive: true,
        occurrenceKey: signal.occurrenceKey,
        payload: signal.payload,
        lastSeenAt: now,
        resolvedAt: null,
      },
      create: {
        userId: params.userId,
        budgetId: params.budgetId,
        kind: signal.kind,
        fingerprint: signal.fingerprint,
        occurrenceKey: signal.occurrenceKey,
        payload: signal.payload,
        isActive: true,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
  }

  const fingerprintsByKind = new Map<NotificationKind, string[]>();
  for (const signal of signals) {
    const list = fingerprintsByKind.get(signal.kind) ?? [];
    list.push(signal.fingerprint);
    fingerprintsByKind.set(signal.kind, list);
  }

  const allKinds: NotificationKind[] = ["FORECAST_RISK", "REOCCURRENCE_HEALTH"];
  for (const kind of allKinds) {
    const keepFingerprints = fingerprintsByKind.get(kind) ?? [];
    await prismaNotifications.notificationEvent.updateMany({
      where: {
        userId: params.userId,
        budgetId: params.budgetId,
        kind,
        isActive: true,
        ...(keepFingerprints.length > 0
          ? { fingerprint: { notIn: keepFingerprints } }
          : {}),
      },
      data: {
        isActive: false,
        resolvedAt: now,
      },
    });
  }
}

export async function getNotificationSnapshot(params: {
  userId: number;
  budgetId: number;
}) {
  await ensureBudgetAccess(params.userId, params.budgetId);
  const events = await prismaNotifications.notificationEvent.findMany({
    where: {
      userId: params.userId,
      budgetId: params.budgetId,
      isActive: true,
    },
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
  });

  if (events.length === 0) {
    const empty: NotificationSnapshot = {
      riskAlerts: [],
      recurringHealthIssues: [],
      total: 0,
    };
    return empty;
  }

  const dismissals = await prismaNotifications.notificationDismissal.findMany({
    where: {
      userId: params.userId,
      budgetId: params.budgetId,
      OR: events.map((event) => ({
        kind: event.kind,
        occurrenceKey: event.occurrenceKey,
      })),
    },
    select: {
      kind: true,
      occurrenceKey: true,
    },
  });

  const dismissed = new Set(
    dismissals.map((d) => `${d.kind}:${d.occurrenceKey}`),
  );
  const visible = events.filter(
    (event) => !dismissed.has(`${event.kind}:${event.occurrenceKey}`),
  );

  const riskAlerts: (ForecastRiskAlert & { notificationId: number })[] = [];
  const recurringHealthIssues: (ReoccurrenceHealthIssue & {
    notificationId: number;
  })[] = [];

  for (const event of visible) {
    if (event.kind === "FORECAST_RISK") {
      const parsed = parseRiskPayload(
        event.payload,
        event.id,
        event.occurrenceKey,
      );
      if (parsed) riskAlerts.push(parsed);
      continue;
    }
    const parsed = parseRecurringPayload(
      event.payload,
      event.id,
      event.occurrenceKey,
    );
    if (parsed) recurringHealthIssues.push(parsed);
  }

  return {
    riskAlerts,
    recurringHealthIssues,
    total: riskAlerts.length + recurringHealthIssues.length,
  };
}

export async function dismissNotification(params: {
  userId: number;
  budgetId: number;
  notificationId: number;
}) {
  await ensureBudgetAccess(params.userId, params.budgetId);
  const event = await prismaNotifications.notificationEvent.findFirst({
    where: {
      id: params.notificationId,
      userId: params.userId,
      budgetId: params.budgetId,
      isActive: true,
    },
    select: {
      kind: true,
      occurrenceKey: true,
    },
  });
  if (!event) {
    throw createError({
      statusCode: 404,
      statusMessage: "Notification not found",
    });
  }
  await prismaNotifications.notificationDismissal.upsert({
    where: {
      userId_budgetId_kind_occurrenceKey: {
        userId: params.userId,
        budgetId: params.budgetId,
        kind: event.kind,
        occurrenceKey: event.occurrenceKey,
      },
    },
    update: {
      dismissedAt: dateTimeService.toDate(),
    },
    create: {
      userId: params.userId,
      budgetId: params.budgetId,
      kind: event.kind,
      occurrenceKey: event.occurrenceKey,
    },
  });
}
