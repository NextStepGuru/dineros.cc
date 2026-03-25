<script setup lang="ts">
import type { Category, SavingsGoal } from "~/types/types";
import type { EditSavingsGoalProps } from "~/components/modals/EditSavingsGoal.vue";
import {
  categoryDropdownLabel,
  sortCategoriesForManageList,
} from "~/lib/categorySelect";
import {
  CATEGORY_FILTER_ALL,
  CATEGORY_FILTER_UNCATEGORIZED,
  entryMatchesCategoryFilter,
} from "~/lib/categoryFilter";
import { getAccountRegisterLabel } from "~/lib/utils";
import { shouldSkipViewportTableHeightChange } from "~/lib/viewportTableMaxHeight";

const ModalsEditSavingsGoal = defineAsyncComponent(
  () => import("~/components/modals/EditSavingsGoal.vue"),
);

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Goals | Dineros" });

const listStore = useListStore();
const overlay = useOverlay();
const modal = overlay.create(ModalsEditSavingsGoal);
const globalFilter = ref("");
const categoryFilter = ref(CATEGORY_FILTER_ALL);
const combinedTableFilterRef = ref<{
  collapse: () => void;
  expandAndFocus: () => Promise<void>;
} | null>(null);
const showShortcuts = ref(false);

const categoryFilterSelectItems = computed(() => {
  const items: { label: string; value: string; name: string }[] = [
    {
      label: "All categories",
      value: CATEGORY_FILTER_ALL,
      name: "All categories",
    },
    {
      label: "Uncategorized",
      value: CATEGORY_FILTER_UNCATEGORIZED,
      name: "Uncategorized",
    },
  ];
  const sorted = sortCategoriesForManageList(listStore.getCategories);
  const byId = new Map(listStore.getCategories.map((c) => [c.id, c]));
  for (const c of sorted) {
    const label = categoryDropdownLabel(c.id, byId);
    items.push({
      label,
      value: c.id,
      name: c.name,
    });
  }
  return items;
});

const savingsGoalsForTable = computed(() =>
  listStore.getSavingsGoalsForCurrentBudget.filter((g) => {
    const matchesCategory = entryMatchesCategoryFilter(
      g.categoryId,
      categoryFilter.value,
      listStore.getCategories,
    );
    if (!matchesCategory) return false;

    const q = globalFilter.value.trim().toLowerCase();
    if (!q) return true;

    const sourceLabel = getAccountRegisterLabel(g.sourceAccountRegisterId, registers.value);
    const pocketLabel = getAccountRegisterLabel(g.targetAccountRegisterId, registers.value);
    const categoryLabel = goalCategoryLabel(g);
    const overDebt = g.priorityOverDebt ? "yes" : "no";
    const ignoreMin = g.ignoreMinBalance ? "yes" : "no";

    return (
      (g.name ?? "").toLowerCase().includes(q) ||
      categoryLabel.toLowerCase().includes(q) ||
      sourceLabel.toLowerCase().includes(q) ||
      pocketLabel.toLowerCase().includes(q) ||
      overDebt.includes(q) ||
      ignoreMin.includes(q) ||
      String(g.targetAmount ?? "").toLowerCase().includes(q)
    );
  }),
);

const registers = computed(() => listStore.getAccountRegisters);

const categoryById = computed(() => {
  const m = new Map<string, Category>();
  for (const c of listStore.getCategories) {
    m.set(c.id, c);
  }
  return m;
});

function goalCategoryLabel(goal: SavingsGoal): string {
  if (!goal.categoryId) return "—";
  return categoryDropdownLabel(goal.categoryId, categoryById.value) || "—";
}

function handleTableClick(goal: SavingsGoal) {
  const props: EditSavingsGoalProps = {
    goal,
    callback: (updated) => {
      listStore.patchSavingsGoal(updated);
      listStore.fetchLists();
      modal.close();
    },
    cancel: () => modal.close(),
  };
  modal.open(props);
}

function handleAddGoal() {
  const props: EditSavingsGoalProps = {
    goal: null,
    callback: () => {
      listStore.fetchLists();
      modal.close();
    },
    cancel: () => modal.close(),
  };
  modal.open(props);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

defineShortcuts({
  escape: {
    usingInput: true,
    handler: () => {
      globalFilter.value = "";
      categoryFilter.value = CATEGORY_FILTER_ALL;
      combinedTableFilterRef.value?.collapse();
    },
  },
  meta_a: () => handleAddGoal(),
  meta_f: () => {
    combinedTableFilterRef.value?.expandAndFocus()?.catch(() => {});
  },
});

const sectionEl = ref<HTMLElement | null>(null);
const tableHostEl = ref<HTMLElement | null>(null);
const tableViewportMaxHeight = ref(
  "calc(100dvh - var(--ui-header-height) - 12rem)",
);
const tableViewportAvailablePx = ref<number | null>(null);

function updateTableViewportMaxHeight() {
  if (!tableHostEl.value) return;
  const tableTop = tableHostEl.value?.getBoundingClientRect().top ?? 0;
  const bottomSpacing = 16;
  const available = Math.max(
    220,
    Math.floor(window.innerHeight - tableTop - bottomSpacing),
  );
  if (shouldSkipViewportTableHeightChange(available, tableViewportAvailablePx.value)) {
    return;
  }
  tableViewportAvailablePx.value = available;
  tableViewportMaxHeight.value = `${available}px`;
}

onMounted(() => {
  import("~/components/modals/EditSavingsGoal.vue").catch(() => {});
  window.addEventListener("resize", updateTableViewportMaxHeight);
  nextTick(updateTableViewportMaxHeight);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateTableViewportMaxHeight);
});
</script>

<template>
  <section ref="sectionEl" class="m-4">
    <h1 class="sr-only">Savings Goals</h1>
    <div class="w-full min-w-0 flex flex-wrap xl:flex-nowrap items-center gap-2 mb-4">
      <RegisterListToolbar
        v-model:global-filter="globalFilter"
        v-model:show-shortcuts="showShortcuts"
        :show-refresh="false"
        add-tooltip="Add goal"
        add-title="Add goal"
        add-aria-label="Add goal"
        @add="handleAddGoal"
      >
        <template #filter>
          <FiltersCombinedGlobalCategoryFilter
            ref="combinedTableFilterRef"
            v-model:global-filter="globalFilter"
            v-model:category-filter="categoryFilter"
            :category-items="categoryFilterSelectItems"
            filter-input-id="search"
            input-class="min-w-[8rem] sm:max-w-48 lg:max-w-48 grow"
          />
        </template>
      </RegisterListToolbar>
    </div>

    <UCard v-if="showShortcuts" class="mb-4">
      <template #header>
        <h3 class="font-semibold">Keyboard shortcuts</h3>
      </template>
      <ul class="space-y-2 text-sm">
        <li>Clear text &amp; category filters: ⎋</li>
        <li>Add goal: ⌘ + A</li>
        <li>Open filters &amp; focus search: ⌘ + F</li>
      </ul>
    </UCard>

    <UCard
      v-if="listStore.getSavingsGoalsForCurrentBudget.length === 0 && !listStore.getIsListsLoading"
      class="mb-4"
    >
      <template #header>
        <h3 class="font-semibold">No goals yet</h3>
      </template>
      <p class="frog-text-muted mb-4">
        Add savings goals (e.g. boat, house down payment) and set whether they fund before or after extra debt payments.
      </p>
      <UButton color="primary" size="sm" @click="handleAddGoal">
        Add first goal
      </UButton>
    </UCard>

    <div
      v-if="listStore.getSavingsGoalsForCurrentBudget.length > 0 || listStore.getIsListsLoading"
      ref="tableHostEl"
      class="flex-1 min-h-0 overflow-auto rounded-md border border-primary/40"
      :style="{ maxHeight: tableViewportMaxHeight }"
    >
      <UAlert
        v-if="
          listStore.getSavingsGoalsForCurrentBudget.length > 0 &&
          savingsGoalsForTable.length === 0
        "
        class="mb-2"
        color="neutral"
        variant="subtle"
        title="No goals match this category filter"
        description="Choose All categories, Uncategorized, or another category."
      />
      <div
        v-else-if="listStore.getIsListsLoading && savingsGoalsForTable.length === 0"
        class="p-2 sm:p-4"
      >
        <div class="grid grid-cols-7 gap-2 sm:gap-4 pb-3 border-b border-default">
          <USkeleton class="h-4 w-12" />
          <USkeleton class="h-4 w-16" />
          <USkeleton class="h-4 w-12 ml-auto" />
          <USkeleton class="h-4 w-16" />
          <USkeleton class="h-4 w-16" />
          <USkeleton class="h-4 w-14" />
          <USkeleton class="h-4 w-14" />
        </div>
        <div class="space-y-3 pt-3">
          <div
            v-for="i in 12"
            :key="`goal-skeleton-${i}`"
            class="grid grid-cols-7 gap-2 sm:gap-4 items-center"
          >
            <USkeleton class="h-4 w-24" />
            <USkeleton class="h-4 w-20" />
            <USkeleton class="h-4 w-16 ml-auto" />
            <USkeleton class="h-4 w-20" />
            <USkeleton class="h-4 w-20" />
            <USkeleton class="h-4 w-10" />
            <USkeleton class="h-4 w-10" />
          </div>
        </div>
      </div>
      <table
        v-if="savingsGoalsForTable.length > 0"
        class="w-full min-w-full text-xs sm:text-sm border-collapse"
      >
        <caption class="sr-only">Savings goals</caption>
        <thead class="[&>tr]:relative [&>tr]:after:absolute [&>tr]:after:inset-x-0 [&>tr]:after:bottom-0 [&>tr]:after:h-px [&>tr]:after:bg-border">
          <tr>
            <th scope="col" class="sticky top-0 z-20 bg-default px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-default text-left font-semibold">Name</th>
            <th scope="col" class="sticky top-0 z-20 bg-default px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-default text-left font-semibold whitespace-nowrap">Category</th>
            <th scope="col" class="sticky top-0 z-20 bg-default px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-default text-right font-semibold whitespace-nowrap">Target</th>
            <th scope="col" class="sticky top-0 z-20 bg-default px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-default text-left font-semibold whitespace-nowrap">Source</th>
            <th scope="col" class="sticky top-0 z-20 bg-default px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-default text-left font-semibold whitespace-nowrap">Pocket</th>
            <th scope="col" class="sticky top-0 z-20 bg-default px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-default text-left font-semibold whitespace-nowrap">Over debt</th>
            <th scope="col" class="sticky top-0 z-20 bg-default px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-default text-left font-semibold whitespace-nowrap">Ignore min</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(goal, index) in savingsGoalsForTable"
            :key="goal.id ?? `goal-${index}`"
            class="odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700"
          >
            <td class="p-2 sm:p-4 text-xs sm:text-sm border-b border-default">
              <button
                type="button"
                class="cursor-pointer font-semibold frog-text text-left"
                @click="handleTableClick(goal)"
              >
                {{ goal.name }}
              </button>
            </td>
            <td class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default">
              {{ goalCategoryLabel(goal) }}
            </td>
            <td class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap border-b border-default">
              <DollarFormat :amount="goal.targetAmount" />
            </td>
            <td class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default">
              {{ getAccountRegisterLabel(goal.sourceAccountRegisterId, registers) }}
            </td>
            <td class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default">
              {{ getAccountRegisterLabel(goal.targetAccountRegisterId, registers) }}
            </td>
            <td class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default">
              {{ goal.priorityOverDebt ? "Yes" : "No" }}
            </td>
            <td class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default">
              {{ goal.ignoreMinBalance ? "Yes" : "No" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
