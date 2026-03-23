<script setup lang="ts">
definePageMeta({
  middleware: "auth",
});
useHead({ title: "Notifications | Dineros" });

type ForecastRiskAlert = {
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

type ReoccurrenceHealthIssue = {
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

const authStore = useAuthStore();
const { $api } = useNuxtApp();
const loading = ref(false);
const riskAlerts = ref<ForecastRiskAlert[]>([]);
const recurringHealthIssues = ref<ReoccurrenceHealthIssue[]>([]);
const actionLoadingKeys = ref<Set<string>>(new Set());
const currentTab = ref<"all" | "risk" | "recurring">("all");

const totalNotifications = computed(
  () => riskAlerts.value.length + recurringHealthIssues.value.length,
);
const visibleRiskAlerts = computed(() =>
  currentTab.value === "recurring" ? [] : riskAlerts.value,
);
const visibleRecurringIssues = computed(() =>
  currentTab.value === "risk" ? [] : recurringHealthIssues.value,
);

function formatRiskEta(daysUntilRisk: number): string {
  if (daysUntilRisk <= 0) return "today";
  if (daysUntilRisk === 1) return "in 1 day";
  return `in ${daysUntilRisk} days`;
}

async function fetchNotifications() {
  if (!authStore.getBudgetId) {
    riskAlerts.value = [];
    recurringHealthIssues.value = [];
    return;
  }
  loading.value = true;
  try {
    const [riskData, recurringData] = await Promise.all([
      ($api as typeof $fetch)<{ alerts: ForecastRiskAlert[] }>(
        "/api/forecast-risk-alerts",
        {
          query: {
            budgetId: authStore.getBudgetId,
            daysAhead: 90,
          },
        },
      ),
      ($api as typeof $fetch)<{ issues: ReoccurrenceHealthIssue[] }>(
        "/api/reoccurrence-health",
        {
          query: { budgetId: authStore.getBudgetId },
        },
      ),
    ]);
    riskAlerts.value = riskData.alerts ?? [];
    recurringHealthIssues.value = recurringData.issues ?? [];
  } catch {
    riskAlerts.value = [];
    recurringHealthIssues.value = [];
  } finally {
    loading.value = false;
  }
}

async function markRiskAlert(
  key: string,
  status: "dismissed" | "resolved",
) {
  if (!authStore.getBudgetId) return;
  actionLoadingKeys.value.add(key);
  try {
    const data = await ($api as typeof $fetch)<{ alerts: ForecastRiskAlert[] }>(
      `/api/forecast-risk-alerts/state?budgetId=${authStore.getBudgetId}`,
      {
        method: "PATCH",
        body: { key, status },
      },
    );
    riskAlerts.value = data.alerts ?? [];
    if (import.meta.client) {
      globalThis.dispatchEvent(new Event("notifications:refresh"));
    }
  } catch {
    // Intentionally silent; global errors can be surfaced later via toasts.
  } finally {
    actionLoadingKeys.value.delete(key);
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

  UAlert(
    v-if="!loading && totalNotifications === 0"
    color="success"
    variant="subtle"
    title="All clear"
    description="No forecast risk alerts or recurring rule health issues right now.")

  UCard(v-if="visibleRiskAlerts.length > 0")
    template(#header)
      h2(class="font-semibold") Cash-flow risk alerts ({{ visibleRiskAlerts.length }})
    ul(class="space-y-2 text-sm")
      li(v-for="alert in visibleRiskAlerts" :key="`risk-${alert.accountRegisterId}-${alert.riskAt}`" class="frog-text-muted")
        b(class="frog-text") {{ alert.accountRegisterName }}:
        span &nbsp;{{ alert.riskType === "below_min_balance" ? "below minimum balance" : "projected negative" }} {{ formatRiskEta(alert.daysUntilRisk) }}
        span &nbsp;({{ formatDate(alert.riskAt) }})
        UButton(size="xs" variant="soft" class="ml-2" :to="`/register/${alert.accountRegisterId}`") Open register
        UButton(
          size="xs"
          variant="ghost"
          class="ml-2"
          :loading="actionLoadingKeys.has(alert.key)"
          :disabled="actionLoadingKeys.has(alert.key)"
          @click="markRiskAlert(alert.key, 'resolved')") Mark resolved
        UButton(
          size="xs"
          variant="ghost"
          class="ml-1"
          :loading="actionLoadingKeys.has(alert.key)"
          :disabled="actionLoadingKeys.has(alert.key)"
          @click="markRiskAlert(alert.key, 'dismissed')") Dismiss

  UCard(v-if="visibleRecurringIssues.length > 0")
    template(#header)
      h2(class="font-semibold") Recurring rule health checks ({{ visibleRecurringIssues.length }})
    ul(class="space-y-2 text-sm")
      li(v-for="issue in visibleRecurringIssues.slice(0, 20)" :key="`rec-${issue.type}-${issue.reoccurrenceId}`" class="frog-text-muted")
        b(class="frog-text") {{ issue.accountRegisterName }}:
        span &nbsp;{{ issue.description }} — {{ issue.details }}
        UButton(size="xs" variant="soft" class="ml-2" to="/reoccurrences") Review rule
</template>
