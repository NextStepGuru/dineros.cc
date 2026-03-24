export type ForecastRiskAlert = {
  notificationId: number;
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

export type ReoccurrenceHealthIssue = {
  notificationId: number;
  type:
    | "duplicate_rule"
    | "ended_rule"
    | "last_run_after_end"
    | "stale_last_run"
    | "zero_amount";
  reoccurrenceId: number;
  description: string;
  accountRegisterId: number;
  accountRegisterName: string;
  details: string;
};

export type BillCenterAlert = {
  billInstanceId: number;
  accountRegisterId: number;
  accountRegisterName: string;
  description: string;
  amount: number;
  dueAt: string;
  status: "OVERDUE" | "DUE_TODAY" | "DUE_SOON";
};

export type ReconciliationAlert = {
  periodId: number;
  accountRegisterId: number;
  accountRegisterName: string;
  updatedAt: string;
};

export type NotificationFetchStatus = "ok" | "timeout" | "error";

type NotificationsResponse = {
  riskAlerts?: ForecastRiskAlert[];
  recurringHealthIssues?: ReoccurrenceHealthIssue[];
  billAlerts?: BillCenterAlert[];
  reconciliationAlerts?: ReconciliationAlert[];
  riskStatus?: NotificationFetchStatus;
  recurringStatus?: NotificationFetchStatus;
  total?: number;
};
type ApiFetcher = typeof $fetch;

export type NotificationSnapshot = {
  riskAlerts: ForecastRiskAlert[];
  recurringHealthIssues: ReoccurrenceHealthIssue[];
  billAlerts: BillCenterAlert[];
  reconciliationAlerts: ReconciliationAlert[];
  riskStatus: NotificationFetchStatus;
  recurringStatus: NotificationFetchStatus;
  total: number;
};

export const NOTIFICATIONS_REFRESH_EVENT = "notifications:refresh";

export type NotificationsRefreshDetail = {
  count?: number;
  reason?: "load" | "mutation" | "budget-change" | "error" | "manual";
};

async function withStatusTimeout<T>(
  task: Promise<T>,
  fallback: T,
  timeoutMs: number,
): Promise<{ data: T; status: NotificationFetchStatus }> {
  return await new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ data: fallback, status: "timeout" });
    }, timeoutMs);

    task
      .then((data) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ data, status: "ok" });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ data: fallback, status: "error" });
      });
  });
}

export async function fetchNotificationSnapshot(params: {
  api: ApiFetcher;
  budgetId: number | null | undefined;
  daysAhead?: number;
  timeoutMs?: number;
}): Promise<NotificationSnapshot> {
  const { api, budgetId, daysAhead = 90, timeoutMs = 10000 } = params;
  if (!budgetId) {
    return {
      riskAlerts: [],
      recurringHealthIssues: [],
      billAlerts: [],
      reconciliationAlerts: [],
      riskStatus: "ok",
      recurringStatus: "ok",
      total: 0,
    };
  }

  const result = await withStatusTimeout(
    api<NotificationsResponse>("/api/notifications", {
      query: { budgetId, daysAhead },
    }),
    {
      riskAlerts: [],
      recurringHealthIssues: [],
      billAlerts: [],
      reconciliationAlerts: [],
      riskStatus: "error",
      recurringStatus: "error",
      total: 0,
    },
    timeoutMs,
  );
  const riskAlerts = result.data.riskAlerts ?? [];
  const recurringHealthIssues = result.data.recurringHealthIssues ?? [];
  const billAlerts = result.data.billAlerts ?? [];
  const reconciliationAlerts = result.data.reconciliationAlerts ?? [];
  const riskStatus = result.data.riskStatus ?? result.status;
  const recurringStatus = result.data.recurringStatus ?? result.status;
  const total =
    result.data.total ??
    riskAlerts.length +
      recurringHealthIssues.length +
      billAlerts.length +
      reconciliationAlerts.length;
  return {
    riskAlerts,
    recurringHealthIssues,
    billAlerts,
    reconciliationAlerts,
    riskStatus,
    recurringStatus,
    total,
  };
}

export async function dismissNotification(params: {
  api: ApiFetcher;
  budgetId: number;
  notificationId: number;
  status?: "dismissed" | "resolved";
}) {
  const { api, budgetId, notificationId, status = "dismissed" } = params;
  return await api<NotificationsResponse>(
    `/api/notifications/${notificationId}/dismiss`,
    {
      method: "PATCH",
      body: { budgetId, status },
    },
  );
}

export function dispatchNotificationsRefresh(
  detail: NotificationsRefreshDetail,
) {
  if (!import.meta.client) return;
  globalThis.dispatchEvent(
    new CustomEvent<NotificationsRefreshDetail>(NOTIFICATIONS_REFRESH_EVENT, {
      detail,
    }),
  );
}
