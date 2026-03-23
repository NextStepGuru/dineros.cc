<script setup lang="ts">
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

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

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
  .flex.flex-wrap.items-center.justify-between.gap-2
    div
      h1(class="text-xl font-semibold") Reconciliation Workspace
      p(class="text-sm frog-text-muted")
        | {{ accountName }} · statement period close workflow.
    UButton(variant="soft" :to="`/register/${accountRegisterId}`") Back to register

  UAlert(
    v-if="!periodId"
    color="info"
    variant="subtle"
    title="Open a statement period"
    description="Create a reconciliation period to start cleared/uncleared matching.")

  UCard(v-if="!periodId")
    div(class="grid grid-cols-1 md:grid-cols-3 gap-3")
      UFormField(label="Start date")
        UInput(v-model="openForm.startDate" type="date")
      UFormField(label="End date")
        UInput(v-model="openForm.endDate" type="date")
      UFormField(label="Statement ending balance")
        UInputNumber(v-model="openForm.statementEndingBalance" :step="0.01")
    .mt-3
      UButton(color="primary" @click="openPeriod") Open period

  template(v-else-if="workspace")
    UCard
      .flex.flex-wrap.items-center.gap-2.justify-between
        div
          h2(class="font-semibold")
            | {{ new Date(workspace.period.startDate).toLocaleDateString() }} - {{ new Date(workspace.period.endDate).toLocaleDateString() }}
          p(class="text-sm frog-text-muted")
            | Statement {{ formatMoney(workspace.period.statementEndingBalance) }} · Cleared {{ formatMoney(workspace.period.ledgerClearedBalance) }}
        UBadge(
          :color="Math.abs(workspace.period.differenceAmount) < 0.01 ? 'success' : 'error'"
          variant="solid")
          | Difference {{ formatMoney(workspace.period.differenceAmount) }}
      p(v-if="workspace.discrepancyHints.hasDifference" class="text-sm mt-2 frog-text-muted")
        | Hints: {{ workspace.discrepancyHints.possibleSignMismatchCount }} uncleared same-sign rows.
        span(v-if="workspace.discrepancyHints.nearMatchEntryId")
          |  Near match found.

    UCard
      template(#header)
        h3(class="font-semibold") Statement candidates
      div(class="max-h-[55dvh] overflow-auto border rounded")
        table(class="w-full text-sm")
          thead
            tr(class="border-b")
              th(class="text-left p-2") Clear
              th(class="text-left p-2") Date
              th(class="text-left p-2") Description
              th(class="text-right p-2") Amount
              th(class="text-right p-2") Balance
              th(class="text-right p-2") Register
          tbody
            tr(v-for="item in workspace.items" :key="item.registerEntryId" class="border-b")
              td(class="p-2")
                UCheckbox(
                  :model-value="item.isCleared"
                  :disabled="actionLoading.has(item.registerEntryId)"
                  @update:model-value="toggleCleared(item)")
              td(class="p-2 whitespace-nowrap") {{ new Date(item.entry.createdAt).toLocaleDateString() }}
              td(class="p-2") {{ item.entry.description }}
              td(class="p-2 text-right whitespace-nowrap") {{ formatMoney(item.entry.amount) }}
              td(class="p-2 text-right whitespace-nowrap") {{ formatMoney(item.entry.balance) }}
              td(class="p-2 text-right")
                UBadge(v-if="item.entry.isReconciled" color="success" variant="subtle") Reconciled
                UBadge(v-else-if="item.entry.isCleared" color="info" variant="subtle") Cleared
                UBadge(v-else color="neutral" variant="subtle") Open

    UCard
      template(#header)
        h3(class="font-semibold") Close period
      .space-y-3
        UFormField(label="Close note (optional)")
          UInput(v-model="closeNote")
        UCheckbox(
          v-model="createAdjustmentEntry"
          label="Create adjustment entry automatically when difference is non-zero")
        .flex.flex-wrap.gap-2
          UButton(
            color="primary"
            :loading="actionLoading.has('close')"
            :disabled="actionLoading.has('close')"
            @click="closePeriod") Close period
          UButton(variant="soft" :to="`/register/${accountRegisterId}`") Return to register
</template>
