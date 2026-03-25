<script setup lang="ts">
import { formatMoneyUsd } from "~/lib/bankers-rounding";

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Reconciliation | Dineros" });

type ReconciliationWorkspace = {
  period: {
    id: number;
    status: "OPEN" | "CLOSED";
    accountRegisterId: number;
    startDate: string;
    endDate: string;
    statementOpeningBalance: number;
    statementEndingBalance: number;
    ledgerClearedBalance: number;
    differenceAmount: number;
    closeNote: string | null;
    register: { id: number; name: string };
  };
  items: Array<{
    id: number;
    registerEntryId: string;
    isCleared: boolean;
    note: string | null;
    entry: {
      id: string;
      createdAt: string;
      description: string;
      amount: number;
      balance: number;
      isCleared: boolean;
      isReconciled: boolean;
    };
  }>;
  discrepancyHints: {
    hasDifference: boolean;
    nearMatchEntryId: string | null;
    possibleSignMismatchCount: number;
  };
};

const route = useRoute();
const authStore = useAuthStore();
const listStore = useListStore();
const toast = useToast();
const { $api } = useNuxtApp();

const loading = ref(false);
const actionLoading = ref<Set<string>>(new Set());
const periodId = ref<number | null>(null);
const workspace = ref<ReconciliationWorkspace | null>(null);
const createAdjustmentEntry = ref(false);
const closeNote = ref("");

const openForm = reactive({
  startDate: "",
  endDate: "",
  statementOpeningBalance: 0,
  statementEndingBalance: 0,
});

const accountRegisterId = computed(() =>
  Number.parseInt(String(route.params.accountRegisterId || 0), 10),
);

const accountName = computed(
  () =>
    listStore.getAccountRegisters.find((r) => r.id === accountRegisterId.value)
      ?.name ?? "Register",
);

const formatMoney = (amount: number) => formatMoneyUsd(amount);

const clearedItems = computed(
  () => workspace.value?.items.filter((i) => i.isCleared) ?? [],
);
const unclearedItems = computed(
  () => workspace.value?.items.filter((i) => !i.isCleared) ?? [],
);
const clearedCount = computed(() => clearedItems.value.length);
const totalCount = computed(() => workspace.value?.items.length ?? 0);
const progressPercent = computed(() =>
  totalCount.value > 0
    ? Math.round((clearedCount.value / totalCount.value) * 100)
    : 0,
);
const differenceIsZero = computed(
  () =>
    workspace.value != null &&
    Math.abs(workspace.value.period.differenceAmount) < 0.01,
);

async function loadOpenPeriod() {
  if (!authStore.getBudgetId || !accountRegisterId.value) return;
  const open = await ($api as typeof $fetch)<{ id: number } | null>(
    "/api/reconciliation/period",
    {
      query: {
        budgetId: authStore.getBudgetId,
        accountRegisterId: accountRegisterId.value,
      },
    },
  );
  periodId.value = open?.id ?? null;
}

async function loadWorkspace() {
  if (!periodId.value) {
    workspace.value = null;
    return;
  }
  loading.value = true;
  try {
    workspace.value = await ($api as typeof $fetch)<ReconciliationWorkspace>(
      `/api/reconciliation/period/${periodId.value}`,
    );
  } catch {
    toast.add({
      color: "error",
      description: "Failed to load reconciliation workspace.",
    });
  } finally {
    loading.value = false;
  }
}

async function openPeriod() {
  if (!authStore.getBudgetId || !accountRegisterId.value) return;
  try {
    const created = await ($api as typeof $fetch)<{ id: number }>(
      "/api/reconciliation/period",
      {
        method: "POST",
        body: {
          budgetId: authStore.getBudgetId,
          accountRegisterId: accountRegisterId.value,
          startDate: openForm.startDate,
          endDate: openForm.endDate,
          statementOpeningBalance: openForm.statementOpeningBalance,
          statementEndingBalance: openForm.statementEndingBalance,
        },
      },
    );
    periodId.value = created.id;
    toast.add({
      color: "success",
      description: "Reconciliation period opened.",
    });
    await loadWorkspace();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to open reconciliation period.",
    });
  }
}

async function toggleCleared(item: ReconciliationWorkspace["items"][number]) {
  actionLoading.value.add(item.registerEntryId);
  try {
    await ($api as typeof $fetch)(
      `/api/reconciliation/item/${item.registerEntryId}`,
      {
        method: "PATCH",
        body: { isCleared: !item.isCleared },
      },
    );
    await loadWorkspace();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to update cleared state.",
    });
  } finally {
    actionLoading.value.delete(item.registerEntryId);
  }
}

async function closePeriod() {
  if (!periodId.value) return;
  actionLoading.value.add("close");
  try {
    await ($api as typeof $fetch)(
      `/api/reconciliation/period/${periodId.value}/close`,
      {
        method: "POST",
        body: {
          closeNote: closeNote.value || null,
          createAdjustmentEntry: createAdjustmentEntry.value,
        },
      },
    );
    toast.add({
      color: "success",
      description: "Reconciliation period closed.",
    });
    periodId.value = null;
    workspace.value = null;
    await loadOpenPeriod();
    await loadWorkspace();
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } };
    toast.add({
      color: "error",
      description:
        err?.data?.message ??
        "Unable to close period. Resolve difference or enable adjustment.",
    });
  } finally {
    actionLoading.value.delete("close");
  }
}

function initDefaultDates() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  openForm.startDate = start.toISOString().slice(0, 10);
  openForm.endDate = end.toISOString().slice(0, 10);
}

watch(
  [() => authStore.getBudgetId, accountRegisterId],
  async () => {
    if (!openForm.startDate) initDefaultDates();
    await loadOpenPeriod();
    await loadWorkspace();
  },
  { immediate: true },
);
</script>

<template lang="pug">
section(class="px-3 sm:px-4 py-4 max-w-6xl mx-auto space-y-4")
  //- Header
  .flex.flex-wrap.items-center.justify-between.gap-2
    div
      h1(class="text-xl font-semibold") {{ accountName }}
      p(class="text-sm frog-text-muted") Reconciliation workspace
    .flex.items-center.gap-2
      UButton(variant="soft" to="/reconciliation") All accounts
      UButton(variant="soft" :to="`/register/${accountRegisterId}`") Back to register

  //- Step 1: Open a period (no open period yet)
  template(v-if="!periodId")
    UCard
      template(#header)
        .flex.items-center.gap-2
          UIcon(name="i-lucide-folder-open" class="text-primary")
          h2(class="font-semibold") Open a statement period
      p(class="text-sm frog-text-muted mb-4") Enter your bank statement dates and balances to begin reconciling.
      div(class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4")
        UFormField(label="Start date")
          UInput(v-model="openForm.startDate" type="date")
        UFormField(label="End date")
          UInput(v-model="openForm.endDate" type="date")
        UFormField(label="Opening balance")
          UInputNumber(v-model="openForm.statementOpeningBalance" :step="0.01")
        UFormField(label="Ending balance")
          UInputNumber(v-model="openForm.statementEndingBalance" :step="0.01")
      .mt-4
        UButton(color="primary" icon="i-lucide-play" @click="openPeriod") Open period

  //- Step 2: Active workspace
  template(v-else-if="workspace")
    //- Balance summary bar
    UCard
      .flex.flex-wrap.items-start.justify-between.gap-4
        div(class="space-y-1")
          h2(class="font-semibold text-lg")
            | {{ new Date(workspace.period.startDate).toLocaleDateString() }} – {{ new Date(workspace.period.endDate).toLocaleDateString() }}
          div(class="flex flex-wrap gap-x-6 gap-y-1 text-sm")
            span
              span(class="frog-text-muted") Opening:&nbsp;
              span(class="font-medium") {{ formatMoney(workspace.period.statementOpeningBalance) }}
            span
              span(class="frog-text-muted") Ending:&nbsp;
              span(class="font-medium") {{ formatMoney(workspace.period.statementEndingBalance) }}
            span
              span(class="frog-text-muted") Cleared:&nbsp;
              span(class="font-medium") {{ formatMoney(workspace.period.ledgerClearedBalance) }}
        .text-right.space-y-1
          UBadge(
            :color="differenceIsZero ? 'success' : 'error'"
            variant="solid"
            size="lg")
            | Difference: {{ formatMoney(workspace.period.differenceAmount) }}
          p(class="text-xs frog-text-muted")
            | {{ clearedCount }} of {{ totalCount }} cleared ({{ progressPercent }}%)

    //- Progress bar
    .h-1.rounded-full.bg-elevated.overflow-hidden(v-if="totalCount > 0")
      div(
        class="h-full rounded-full transition-all duration-300"
        :class="differenceIsZero ? 'bg-green-500' : 'bg-primary'"
        :style="{ width: progressPercent + '%' }")

    //- Discrepancy hints
    UAlert(
      v-if="workspace.discrepancyHints.hasDifference && !differenceIsZero"
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      title="Difference detected")
      template(#description)
        span {{ workspace.discrepancyHints.possibleSignMismatchCount }} uncleared entries could affect the balance.
        span(v-if="workspace.discrepancyHints.nearMatchEntryId")
          |  A near-match entry was found.

    //- Transaction table
    UCard
      template(#header)
        .flex.items-center.justify-between
          .flex.items-center.gap-2
            UIcon(name="i-lucide-list-checks")
            h3(class="font-semibold") Transactions
          .flex.items-center.gap-3.text-sm
            span(class="frog-text-muted")
              | {{ unclearedItems.length }} uncleared
            span(class="text-green-500 font-medium")
              | {{ clearedItems.length }} cleared

      div(class="max-h-[55dvh] overflow-auto")
        table(class="w-full text-sm")
          thead
            tr(class="border-b sticky top-0 bg-elevated z-10")
              th(class="text-center p-2 w-12")
                UIcon(name="i-lucide-check-circle" class="frog-text-muted" size="16")
              th(class="text-left p-2") Date
              th(class="text-left p-2") Description
              th(class="text-right p-2") Amount
              th(class="text-right p-2") Status
          tbody
            tr(
              v-for="item in workspace.items"
              :key="item.registerEntryId"
              class="border-b transition-colors"
              :class="item.isCleared ? 'bg-green-500/5' : ''")
              td(class="p-2 text-center")
                UCheckbox(
                  :model-value="item.isCleared"
                  :disabled="actionLoading.has(item.registerEntryId) || item.entry.isReconciled"
                  @update:model-value="toggleCleared(item)")
              td(class="p-2 whitespace-nowrap") {{ new Date(item.entry.createdAt).toLocaleDateString() }}
              td(class="p-2")
                span {{ item.entry.description }}
              td(class="p-2 text-right whitespace-nowrap font-mono"
                :class="item.entry.amount < 0 ? 'text-red-400' : 'text-green-400'")
                | {{ formatMoney(item.entry.amount) }}
              td(class="p-2 text-right")
                UBadge(v-if="item.entry.isReconciled" color="success" variant="subtle" size="xs") Reconciled
                UBadge(v-else-if="item.isCleared" color="info" variant="subtle" size="xs") Cleared
                UBadge(v-else color="neutral" variant="subtle" size="xs") Open

        p(v-if="!workspace.items.length" class="text-center py-8 frog-text-muted")
          | No transactions in this statement period.

    //- Close period
    UCard
      template(#header)
        .flex.items-center.gap-2
          UIcon(name="i-lucide-lock" class="text-primary")
          h3(class="font-semibold") Close period
      .space-y-3
        div(class="text-sm frog-text-muted")
          | When you close the period, all cleared transactions are marked as reconciled.
          span(v-if="!differenceIsZero" class="text-warning font-medium")
            |  The difference is not zero — resolve it or create an adjustment entry.

        UFormField(label="Close note (optional)")
          UInput(v-model="closeNote" placeholder="e.g. March 2026 statement")

        UCheckbox(
          v-model="createAdjustmentEntry"
          label="Create adjustment entry when difference is non-zero")

        .flex.flex-wrap.gap-2
          UButton(
            color="primary"
            icon="i-lucide-check"
            :loading="actionLoading.has('close')"
            :disabled="actionLoading.has('close')"
            @click="closePeriod") Close period
          UButton(variant="soft" to="/reconciliation") Back to accounts
</template>
