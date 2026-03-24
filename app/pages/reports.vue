<script setup lang="ts">
import { formatAccountRegisters } from "~/lib/utils";
import type { AccountRegister } from "~/types/types";

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Reports | Dineros" });

const listStore = useListStore();
const authStore = useAuthStore();
const {
  mode,
  dateFrom,
  dateTo,
  accountRegisterScope,
  includeTransfers,
  showSubcategories,
  loading,
  data,
  errorMessage,
} = useCategoryReports();

const registersSorted = computed((): AccountRegister[] =>
  formatAccountRegisters(listStore.getAccountRegisters),
);

const registerSelectItems = computed(() => {
  const items: { label: string; value: number | "all" }[] = [
    { label: "All registers", value: "all" },
  ];
  for (const r of registersSorted.value) {
    items.push({ label: r.name, value: r.id });
  }
  return items;
});

onMounted(async () => {
  await listStore.fetchLists();
});
</script>

<template lang="pug">
section(class="m-4 max-w-6xl mx-auto space-y-6")
  h1(class="text-xl font-semibold") Category reports

  UCard
    template(#header)
      .flex.flex-wrap.gap-4.items-center.justify-between
        .flex.flex-wrap.gap-2.items-center
          span(class="text-sm font-medium shrink-0") Mode
          .flex.gap-1(
            role="group"
            aria-label="Report mode")
            UButton(
              size="sm"
              :variant="mode === 'past' ? 'solid' : 'outline'"
              @click="mode = 'past'") Past
            UButton(
              size="sm"
              :variant="mode === 'future' ? 'solid' : 'outline'"
              @click="mode = 'future'") Future / forecast
        .flex.flex-wrap.gap-3.items-end
          UFormField(label="From")
            UInput(v-model="dateFrom" type="date" class="w-40")
          UFormField(label="To")
            UInput(v-model="dateTo" type="date" class="w-40")
          UFormField(label="Register" class="min-w-48")
            USelect(
              v-model="accountRegisterScope"
              :items="registerSelectItems"
              valueKey="value"
              labelKey="label"
              placeholder="Scope")
          UFormField(label="Include transfers")
            .flex.items-center(class="h-8")
              USwitch(v-model="includeTransfers")
          UFormField(label="Show subcategories")
            .flex.items-center(class="h-8")
              USwitch(v-model="showSubcategories")

    .space-y-6(class="pt-2")
      template(v-if="!dateFrom || !dateTo")
        .space-y-3(aria-busy="true")
          USkeleton(class="h-24 w-full")
          USkeleton(class="h-64 w-full")

      template(v-else-if="!authStore.getBudgetId")
        UAlert(
          color="neutral"
          variant="subtle"
          title="Choose a budget"
          description="Select a budget in the header to load reports.")

      template(v-else-if="loading")
        .space-y-3(aria-busy="true")
          USkeleton(class="h-24 w-full")
          USkeleton(class="h-64 w-full")

      template(v-else-if="errorMessage")
        UAlert(
          color="error"
          variant="subtle"
          :title="errorMessage")

      template(v-else-if="data && data.summary.transactionCount === 0")
        UAlert(
          color="neutral"
          variant="subtle"
          title="No entries in this range"
          description="Try a different date range, register, or mode (past vs future).")

      template(v-else-if="data")
        .grid.gap-4(class="sm:grid-cols-2 lg:grid-cols-4")
          UCard(class="ring-1 ring-default")
            template(#header)
              span(class="text-sm font-medium text-muted") Money in
            p(class="text-lg font-semibold tabular-nums")
              DollarFormat(:amount="data.summary.totalIn")
          UCard(class="ring-1 ring-default")
            template(#header)
              span(class="text-sm font-medium text-muted") Money out
            p(class="text-lg font-semibold tabular-nums")
              DollarFormat(:amount="data.summary.totalOut")
          UCard(class="ring-1 ring-default")
            template(#header)
              span(class="text-sm font-medium text-muted") Net
            p(class="text-lg font-semibold tabular-nums")
              DollarFormat(:amount="data.summary.net")
          UCard(class="ring-1 ring-default")
            template(#header)
              span(class="text-sm font-medium text-muted") Entries
            p(class="text-lg font-semibold tabular-nums") {{ data.summary.transactionCount }}

        UCard
          template(#header)
            h2(class="font-medium") By category
          .space-y-8
            ReportsCategoryReportsDonut(:categories="data.donutCategories")
            ReportsCategoryReportsGroupedTable(
              :groups="data.tableGroups")
</template>
