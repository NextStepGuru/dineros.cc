<script setup lang="ts">
import { formatAccountRegisters } from "~/lib/utils";

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Reconciliation | Dineros" });

const listStore = useListStore();
const authStore = useAuthStore();
const { setWorkflowMode } = useWorkflowMode();
const { $api } = useNuxtApp();

const registers = computed(() =>
  formatAccountRegisters(listStore.getAccountRegisters),
);

type PeriodSummary = {
  id: number;
  accountRegisterId: number;
  accountRegisterName: string;
  updatedAt: string;
};

const openPeriods = ref<PeriodSummary[]>([]);

async function loadOpenPeriods() {
  if (!authStore.getBudgetId) return;
  try {
    openPeriods.value = await ($api as typeof $fetch)<PeriodSummary[]>(
      "/api/reconciliation/periods/open",
      { query: { budgetId: authStore.getBudgetId } },
    );
  } catch {
    openPeriods.value = [];
  }
}

function getOpenPeriod(registerId: number) {
  return openPeriods.value.find((p) => p.accountRegisterId === registerId);
}

watch(
  () => authStore.getBudgetId,
  () => loadOpenPeriods(),
  { immediate: true },
);

onMounted(() => {
  setWorkflowMode("reconciliation");
});
</script>

<template lang="pug">
section(class="px-3 sm:px-4 py-4 max-w-4xl mx-auto space-y-6")
  UAlert(
    color="neutral"
    variant="subtle"
    title="Reconciliation workflow"
  )
    template(#description)
      span.frog-text-muted Match cleared entries to your statement for each period. Switch to Forecasting in the header when you want projections and recurring rules.
  div
    h1(class="text-xl font-semibold") Reconciliation
    p(class="text-sm frog-text-muted") Select an account to reconcile against your bank statement.

  UAlert(
    v-if="!registers.length"
    color="info"
    variant="subtle"
    title="No accounts"
    description="Create an account register to begin reconciliation.")

  .space-y-2(v-else)
    NuxtLink(
      v-for="reg in registers"
      :key="reg.id"
      :to="`/reconciliation/${reg.id}`"
      class="block")
      UCard(class="hover:ring-1 hover:ring-primary/40 transition-shadow cursor-pointer")
        .flex.items-center.justify-between.gap-3
          div
            p(class="font-medium") {{ reg.name }}
            p(class="text-xs frog-text-muted") {{ `Register #${reg.id}` }}
          div(class="flex items-center gap-2")
            UBadge(
              v-if="getOpenPeriod(reg.id)"
              color="warning"
              variant="subtle") Open period
            UBadge(
              v-else
              color="neutral"
              variant="subtle") No open period
            UIcon(name="i-lucide-chevron-right" class="frog-text-muted")
</template>
