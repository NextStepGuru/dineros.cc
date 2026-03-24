<script setup lang="ts">
import {
  type BillCenterAlert,
  dispatchNotificationsRefresh,
  dismissNotification,
  fetchNotificationSnapshot,
  type ForecastRiskAlert,
  type NotificationFetchStatus,
  type ReconciliationAlert,
  type ReoccurrenceHealthIssue,
} from "~/lib/notifications";
import { formatDate } from "~/lib/utils";

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Notifications | Dineros" });

const authStore = useAuthStore();
const { $api } = useNuxtApp();
const notificationCount = useNotificationCount();
const loading = ref(false);
const riskAlerts = ref<ForecastRiskAlert[]>([]);
const recurringHealthIssues = ref<ReoccurrenceHealthIssue[]>([]);
const billAlerts = ref<BillCenterAlert[]>([]);
const reconciliationAlerts = ref<ReconciliationAlert[]>([]);
const actionLoadingKeys = ref<Set<string>>(new Set());
const currentTab = ref<
  "all" | "risk" | "recurring" | "bills" | "reconciliation"
>("all");
const riskFetchStatus = ref<NotificationFetchStatus>("ok");
const recurringFetchStatus = ref<NotificationFetchStatus>("ok");
const recurringDisplayLimit = 20;

const totalNotifications = computed(
  () =>
    riskAlerts.value.length +
    recurringHealthIssues.value.length +
    billAlerts.value.length +
    reconciliationAlerts.value.length,
);
const visibleRiskAlerts = computed(() =>
  currentTab.value === "recurring" ||
  currentTab.value === "bills" ||
  currentTab.value === "reconciliation"
    ? []
    : riskAlerts.value,
);
const visibleRecurringIssues = computed(() =>
  currentTab.value === "risk" ||
  currentTab.value === "bills" ||
  currentTab.value === "reconciliation"
    ? []
    : recurringHealthIssues.value,
);
const visibleBillAlerts = computed(() =>
  currentTab.value === "risk" ||
  currentTab.value === "recurring" ||
  currentTab.value === "reconciliation"
    ? []
    : billAlerts.value,
);
const visibleReconciliationAlerts = computed(() =>
  currentTab.value === "risk" ||
  currentTab.value === "recurring" ||
  currentTab.value === "bills"
    ? []
    : reconciliationAlerts.value,
);
const shownRecurringIssues = computed(() =>
  visibleRecurringIssues.value.slice(0, recurringDisplayLimit),
);
const hiddenRecurringCount = computed(() =>
  Math.max(
    0,
    visibleRecurringIssues.value.length - shownRecurringIssues.value.length,
  ),
);
const hasPartialData = computed(
  () => riskFetchStatus.value !== "ok" || recurringFetchStatus.value !== "ok",
);
const formatNotificationDate = (dateIso: string): string | null =>
  formatDate(dateIso);
const tabFilteredEmptyMessage = computed(() => {
  if (loading.value || totalNotifications.value === 0) return "";
  if (currentTab.value === "risk" && visibleRiskAlerts.value.length === 0) {
    return recurringHealthIssues.value.length > 0
      ? "No risk alerts in this tab. You still have recurring rule issues."
      : "No risk alerts in this tab.";
  }
  if (
    currentTab.value === "recurring" &&
    visibleRecurringIssues.value.length === 0
  ) {
    return riskAlerts.value.length > 0
      ? "No recurring issues in this tab. You still have cash-flow risk alerts."
      : "No recurring issues in this tab.";
  }
  return "";
});

function formatRiskEta(daysUntilRisk: number): string {
  if (daysUntilRisk <= 0) return "today";
  if (daysUntilRisk === 1) return "in 1 day";
  return `in ${daysUntilRisk} days`;
}

async function fetchNotifications() {
  if (!authStore.getBudgetId) {
    riskAlerts.value = [];
    recurringHealthIssues.value = [];
    billAlerts.value = [];
    reconciliationAlerts.value = [];
    riskFetchStatus.value = "ok";
    recurringFetchStatus.value = "ok";
    notificationCount.value = 0;
    dispatchNotificationsRefresh({ count: 0, reason: "budget-change" });
    return;
  }
  loading.value = true;
  try {
    const snapshot = await fetchNotificationSnapshot({
      api: $api as typeof $fetch,
      budgetId: authStore.getBudgetId,
      daysAhead: 90,
      timeoutMs: 10000,
    });
    riskAlerts.value = snapshot.riskAlerts;
    recurringHealthIssues.value = snapshot.recurringHealthIssues;
    billAlerts.value = snapshot.billAlerts;
    reconciliationAlerts.value = snapshot.reconciliationAlerts;
    riskFetchStatus.value = snapshot.riskStatus;
    recurringFetchStatus.value = snapshot.recurringStatus;
    notificationCount.value = snapshot.total;
    dispatchNotificationsRefresh({ count: snapshot.total, reason: "load" });
  } catch {
    riskAlerts.value = [];
    recurringHealthIssues.value = [];
    billAlerts.value = [];
    reconciliationAlerts.value = [];
    riskFetchStatus.value = "error";
    recurringFetchStatus.value = "error";
    notificationCount.value = 0;
    dispatchNotificationsRefresh({ count: 0, reason: "error" });
  } finally {
    loading.value = false;
  }
}

async function markRiskAlert(
  notificationId: number,
  status: "dismissed" | "resolved",
) {
  if (!authStore.getBudgetId) return;
  actionLoadingKeys.value.add(String(notificationId));
  try {
    const data = await dismissNotification({
      api: $api as typeof $fetch,
      budgetId: authStore.getBudgetId,
      notificationId,
      status,
    });
    riskAlerts.value = data.riskAlerts ?? [];
    recurringHealthIssues.value = data.recurringHealthIssues ?? [];
    billAlerts.value = data.billAlerts ?? [];
    reconciliationAlerts.value = data.reconciliationAlerts ?? [];
    notificationCount.value =
      data.total ??
      riskAlerts.value.length +
        recurringHealthIssues.value.length +
        billAlerts.value.length +
        reconciliationAlerts.value.length;
    dispatchNotificationsRefresh({
      count: notificationCount.value,
      reason: "mutation",
    });
  } catch {
    // Intentionally silent; global errors can be surfaced later via toasts.
  } finally {
    actionLoadingKeys.value.delete(String(notificationId));
  }
}

async function dismissRecurringIssue(notificationId: number) {
  if (!authStore.getBudgetId) return;
  actionLoadingKeys.value.add(String(notificationId));
  try {
    const data = await dismissNotification({
      api: $api as typeof $fetch,
      budgetId: authStore.getBudgetId,
      notificationId,
      status: "dismissed",
    });
    riskAlerts.value = data.riskAlerts ?? [];
    recurringHealthIssues.value = data.recurringHealthIssues ?? [];
    billAlerts.value = data.billAlerts ?? [];
    reconciliationAlerts.value = data.reconciliationAlerts ?? [];
    notificationCount.value =
      data.total ??
      riskAlerts.value.length +
        recurringHealthIssues.value.length +
        billAlerts.value.length +
        reconciliationAlerts.value.length;
    dispatchNotificationsRefresh({
      count: notificationCount.value,
      reason: "mutation",
    });
  } finally {
    actionLoadingKeys.value.delete(String(notificationId));
  }
}

watch(
  () => authStore.getBudgetId,
  async () => {
    await fetchNotifications();
  },
  { immediate: true },
);
</script>

<template lang="pug">
section(class="px-3 sm:px-4 py-4 max-w-5xl mx-auto space-y-4")
  h1(class="text-xl font-semibold") Notification Center
  p(class="text-sm frog-text-muted")
    | Forecast and recurring-rule signals for your current budget.

  .flex.flex-wrap.gap-2
    UButton(
      size="xs"
      :variant="currentTab === 'all' ? 'solid' : 'soft'"
      @click="currentTab = 'all'") All
    UButton(
      size="xs"
      :variant="currentTab === 'risk' ? 'solid' : 'soft'"
      @click="currentTab = 'risk'") Risk
    UButton(
      size="xs"
      :variant="currentTab === 'recurring' ? 'solid' : 'soft'"
      @click="currentTab = 'recurring'") Recurring
    UButton(
      size="xs"
      :variant="currentTab === 'bills' ? 'solid' : 'soft'"
      @click="currentTab = 'bills'") Bills
    UButton(
      size="xs"
      :variant="currentTab === 'reconciliation' ? 'solid' : 'soft'"
      @click="currentTab = 'reconciliation'") Reconciliation

  UAlert(
    v-if="loading"
    color="neutral"
    variant="subtle"
    title="Refreshing notifications"
    description="Checking forecast and recurring-rule signals.")

  UAlert(
    v-if="!loading && hasPartialData"
    color="warning"
    variant="subtle"
    title="Some notifications could not be loaded"
    description="Showing available results. Refresh to retry missing data.")

  UAlert(
    v-if="!loading && totalNotifications === 0"
    color="success"
    variant="subtle"
    title="All clear"
    description="No forecast risk alerts or recurring rule health issues right now.")

  UAlert(
    v-if="tabFilteredEmptyMessage"
    color="neutral"
    variant="subtle"
    :description="tabFilteredEmptyMessage")

  UCard(v-if="visibleRiskAlerts.length > 0")
    template(#header)
      h2(class="font-semibold") Cash-flow risk alerts ({{ visibleRiskAlerts.length }})
    ul(class="space-y-2 text-sm")
      li(v-for="alert in visibleRiskAlerts" :key="`risk-${alert.accountRegisterId}-${alert.riskAt}`" class="frog-text-muted")
        b(class="frog-text") {{ alert.accountRegisterName }}:
        span &nbsp;{{ alert.riskType === "below_min_balance" ? "below minimum balance" : "projected negative" }} {{ formatRiskEta(alert.daysUntilRisk) }}
        span &nbsp;({{ formatNotificationDate(alert.riskAt) }})
        UButton(size="xs" variant="soft" class="ml-2" :to="`/register/${alert.accountRegisterId}`") Open register
        UButton(
          size="xs"
          variant="ghost"
          class="ml-2"
          :loading="actionLoadingKeys.has(String(alert.notificationId))"
          :disabled="actionLoadingKeys.has(String(alert.notificationId))"
          @click="markRiskAlert(alert.notificationId, 'resolved')") Mark resolved
        UButton(
          size="xs"
          variant="ghost"
          class="ml-1"
          :loading="actionLoadingKeys.has(String(alert.notificationId))"
          :disabled="actionLoadingKeys.has(String(alert.notificationId))"
          @click="markRiskAlert(alert.notificationId, 'dismissed')") Dismiss

  UCard(v-if="visibleRecurringIssues.length > 0")
    template(#header)
      h2(class="font-semibold") Recurring rule health checks ({{ visibleRecurringIssues.length }})
    p(
      v-if="hiddenRecurringCount > 0"
      class="text-xs frog-text-muted mb-2")
      | Showing first {{ shownRecurringIssues.length }} of {{ visibleRecurringIssues.length }} recurring issues.
    ul(class="space-y-2 text-sm")
      li(v-for="issue in shownRecurringIssues" :key="`rec-${issue.type}-${issue.reoccurrenceId}`" class="frog-text-muted")
        b(class="frog-text") {{ issue.accountRegisterName }}:
        span &nbsp;{{ issue.description }} — {{ issue.details }}
        UButton(size="xs" variant="soft" class="ml-2" to="/reoccurrences") Review rule
        UButton(
          size="xs"
          variant="ghost"
          class="ml-1"
          :loading="actionLoadingKeys.has(String(issue.notificationId))"
          :disabled="actionLoadingKeys.has(String(issue.notificationId))"
          @click="dismissRecurringIssue(issue.notificationId)") Dismiss

  UCard(v-if="visibleBillAlerts.length > 0")
    template(#header)
      h2(class="font-semibold") Bill center due items ({{ visibleBillAlerts.length }})
    ul(class="space-y-2 text-sm")
      li(v-for="bill in visibleBillAlerts" :key="`bill-${bill.billInstanceId}`" class="frog-text-muted")
        b(class="frog-text") {{ bill.accountRegisterName }}:
        span &nbsp;{{ bill.description }} · {{ bill.status.toLowerCase().replace('_', ' ') }} · {{ formatNotificationDate(bill.dueAt) }}
        UButton(size="xs" variant="soft" class="ml-2" :to="`/bills`") Open Bill Center
        UButton(size="xs" variant="ghost" class="ml-1" :to="`/register/${bill.accountRegisterId}`") Open register

  UCard(v-if="visibleReconciliationAlerts.length > 0")
    template(#header)
      h2(class="font-semibold") Open reconciliation periods ({{ visibleReconciliationAlerts.length }})
    ul(class="space-y-2 text-sm")
      li(v-for="rec in visibleReconciliationAlerts" :key="`recon-${rec.periodId}`" class="frog-text-muted")
        b(class="frog-text") {{ rec.accountRegisterName }}:
        span &nbsp;period still open (updated {{ formatNotificationDate(rec.updatedAt) }}).
        UButton(size="xs" variant="soft" class="ml-2" :to="`/reconciliation/${rec.accountRegisterId}`") Resume reconciliation
</template>
