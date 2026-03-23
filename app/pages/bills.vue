<script setup lang="ts">
import { formatMoneyUsd } from "~/lib/bankers-rounding";

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Bills | Dineros" });

type BillStatus =
  | "UPCOMING"
  | "DUE_SOON"
  | "DUE_TODAY"
  | "OVERDUE"
  | "PAID"
  | "SKIPPED"
  | "PARTIAL";

type BillItem = {
  id: number;
  status: BillStatus;
  dueAt: string;
  amount: number;
  paidAt: string | null;
  paidAmount: number | null;
  note: string | null;
  projectedBalanceAfter: number;
  isAmountOutOfExpectedRange: boolean;
  profile: {
    id: number;
    kind: "BILL" | "INCOME" | "TRANSFER";
    payee: string | null;
    isAutoPay: boolean;
    graceDays: number;
    reminderDaysBefore: string | null;
    priority: number;
    reoccurrenceId: number;
    register: { id: number; name: string };
    description: string;
    baseAmount: number;
  };
};

type BillsSnapshot = {
  items: BillItem[];
  counts: {
    overdue: number;
    dueSoon: number;
    dueToday: number;
    upcoming: number;
    paid: number;
    skipped: number;
    partial: number;
  };
};

const authStore = useAuthStore();
const toast = useToast();
const { $api } = useNuxtApp();
const loading = ref(false);
const actionLoading = ref<Set<number>>(new Set());
const includeIncome = ref(false);
const data = ref<BillsSnapshot>({
  items: [],
  counts: {
    overdue: 0,
    dueSoon: 0,
    dueToday: 0,
    upcoming: 0,
    paid: 0,
    skipped: 0,
    partial: 0,
  },
});

const sortedItems = computed(() =>
  [...data.value.items].sort((a, b) => {
    if (a.status === b.status) {
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    }
    const rank: Record<BillStatus, number> = {
      OVERDUE: 0,
      DUE_TODAY: 1,
      DUE_SOON: 2,
      UPCOMING: 3,
      PARTIAL: 4,
      PAID: 5,
      SKIPPED: 6,
    };
    return rank[a.status] - rank[b.status];
  }),
);

const unresolvedCount = computed(
  () =>
    data.value.counts.overdue +
    data.value.counts.dueToday +
    data.value.counts.dueSoon,
);

const formatMoney = (amount: number) => formatMoneyUsd(amount);

function statusColor(status: BillStatus) {
  if (status === "OVERDUE") return "error";
  if (status === "DUE_TODAY") return "warning";
  if (status === "DUE_SOON") return "warning";
  if (status === "PAID") return "success";
  if (status === "PARTIAL") return "warning";
  if (status === "SKIPPED") return "neutral";
  return "neutral";
}

function statusLabel(status: BillStatus) {
  if (status === "DUE_SOON") return "Due soon";
  if (status === "DUE_TODAY") return "Due today";
  return status.charAt(0) + status.slice(1).toLowerCase().replace("_", " ");
}

async function loadBills() {
  if (!authStore.getBudgetId) return;
  loading.value = true;
  try {
    const result = await ($api as typeof $fetch)<BillsSnapshot>("/api/bills", {
      query: {
        budgetId: authStore.getBudgetId,
        includeIncome: includeIncome.value,
      },
    });
    data.value = result;
  } catch {
    toast.add({
      color: "error",
      description: "Failed to load Bill Center.",
    });
  } finally {
    loading.value = false;
  }
}

async function setStatus(item: BillItem, status: BillStatus) {
  actionLoading.value.add(item.id);
  try {
    await ($api as typeof $fetch)(`/api/bill-instance/${item.id}`, {
      method: "PATCH",
      body: {
        status,
      },
    });
    toast.add({
      color: "success",
      description: `Updated ${item.profile.description}.`,
    });
    await loadBills();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to update bill status.",
    });
  } finally {
    actionLoading.value.delete(item.id);
  }
}

async function runReminderEvaluation() {
  if (!authStore.getBudgetId) return;
  try {
    const result = await ($api as typeof $fetch)<{
      remindedCount: number;
      overdueCount: number;
      dueSoonCount: number;
    }>("/api/bills/reminders/evaluate", {
      method: "POST",
      body: { budgetId: authStore.getBudgetId },
    });
    toast.add({
      color: "success",
      description: `Evaluated reminders for ${result.remindedCount} items.`,
    });
    await loadBills();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to evaluate reminders.",
    });
  }
}

watch(
  () => authStore.getBudgetId,
  async () => {
    await loadBills();
  },
  { immediate: true },
);

watch(includeIncome, async () => {
  await loadBills();
});
</script>

<template lang="pug">
section(class="px-3 sm:px-4 py-4 max-w-6xl mx-auto space-y-4")
  .flex.flex-wrap.items-center.justify-between.gap-2
    div
      h1(class="text-xl font-semibold") Bill Center
      p(class="text-sm frog-text-muted")
        | Centralized due calendar, reminders, and payment status.
    .flex.items-center.gap-2
      UButton(size="sm" variant="ghost" icon="i-lucide-calculator" :to="`/notifications`") Monthly close alerts
      UButton(size="sm" variant="soft" icon="i-lucide-bell-ring" @click="runReminderEvaluation") Evaluate reminders
      UButton(size="sm" variant="soft" icon="i-lucide-refresh-cw" :loading="loading" @click="loadBills") Refresh

  .flex.flex-wrap.gap-2.items-center
    UBadge(color="error" variant="solid") Overdue: {{ data.counts.overdue }}
    UBadge(color="warning" variant="solid") Due today: {{ data.counts.dueToday }}
    UBadge(color="warning" variant="subtle") Due soon: {{ data.counts.dueSoon }}
    UBadge(color="neutral" variant="subtle") Upcoming: {{ data.counts.upcoming }}
    UBadge(color="success" variant="subtle") Paid: {{ data.counts.paid }}
    UBadge(v-if="unresolvedCount > 0" color="error" variant="solid") Action needed: {{ unresolvedCount }}
    UCheckbox(v-model="includeIncome" label="Include income items")

  UAlert(
    v-if="loading"
    color="neutral"
    variant="subtle"
    title="Loading bills"
    description="Building due statuses and forecast impact.")

  UAlert(
    v-else-if="sortedItems.length === 0"
    color="success"
    variant="subtle"
    title="No bill items found"
    description="Create recurring items first, then Bill Center will populate automatically.")

  UCard(v-for="item in sortedItems" :key="item.id")
    .flex.flex-wrap.items-start.justify-between.gap-2
      .space-y-1
        .flex.items-center.gap-2
          h3(class="font-semibold") {{ item.profile.payee || item.profile.description }}
          UBadge(:color="statusColor(item.status)" variant="subtle") {{ statusLabel(item.status) }}
          UBadge(v-if="item.profile.isAutoPay" color="info" variant="subtle") AutoPay
          UBadge(v-if="item.isAmountOutOfExpectedRange" color="warning" variant="subtle") Amount drift
        p(class="text-sm frog-text-muted")
          | Due {{ new Date(item.dueAt).toLocaleDateString() }} · {{ item.profile.register.name }}
        p(class="text-sm frog-text-muted")
          | Amount {{ formatMoney(item.amount) }} · Forecast after payment {{ formatMoney(item.projectedBalanceAfter) }}
        p(v-if="item.projectedBalanceAfter < 0" class="text-sm text-red-500")
          | This payment may push balance below zero.
      .flex.flex-wrap.gap-1
        UButton(
          size="xs"
          variant="soft"
          :loading="actionLoading.has(item.id)"
          :disabled="actionLoading.has(item.id) || item.status === 'PAID'"
          @click="setStatus(item, 'PAID')") Mark paid
        UButton(
          size="xs"
          variant="soft"
          :loading="actionLoading.has(item.id)"
          :disabled="actionLoading.has(item.id) || item.status === 'SKIPPED'"
          @click="setStatus(item, 'SKIPPED')") Skip
        UButton(
          size="xs"
          variant="ghost"
          :loading="actionLoading.has(item.id)"
          :disabled="actionLoading.has(item.id) || item.status === 'UPCOMING'"
          @click="setStatus(item, 'UPCOMING')") Reopen
        UButton(size="xs" variant="ghost" :to="`/reoccurrences`") Edit recurring rule
</template>
