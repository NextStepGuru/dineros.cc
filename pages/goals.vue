<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
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
  listStore.getSavingsGoalsForCurrentBudget.filter((g) =>
    entryMatchesCategoryFilter(
      g.categoryId,
      categoryFilter.value,
      listStore.getCategories,
    ),
  ),
);

const tableUi = ref({
  root: "!overflow-visible relative min-h-0",
  base: "!overflow-visible min-w-full",
  thead: "!z-30",
  tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
});

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

const columns: TableColumn<SavingsGoal>[] = [
  {
    accessorKey: "name",
    header: () => h("div", {}, "Name"),
    cell: ({ row }) =>
      h(
        "div",
        {
          class: "cursor-pointer font-semibold text-white",
          onClick: () => handleTableClick(row.original),
        },
        row.getValue("name"),
      ),
  },
  {
    accessorKey: "categoryId",
    header: () => h("div", {}, "Category"),
    cell: ({ row }) => goalCategoryLabel(row.original),
  },
  {
    accessorKey: "targetAmount",
    header: () => h("div", { class: "text-right" }, "Target"),
    cell: ({ row }) =>
      h(
        "div",
        { class: "text-right" },
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(row.getValue("targetAmount")),
      ),
  },
  {
    accessorKey: "sourceAccountRegisterId",
    header: () => h("div", {}, "Source"),
    cell: ({ row }) =>
      getAccountRegisterLabel(
        row.getValue("sourceAccountRegisterId"),
        registers.value,
      ),
  },
  {
    accessorKey: "targetAccountRegisterId",
    header: () => h("div", {}, "Pocket"),
    cell: ({ row }) =>
      getAccountRegisterLabel(
        row.getValue("targetAccountRegisterId"),
        registers.value,
      ),
  },
  {
    accessorKey: "priorityOverDebt",
    header: () => h("div", {}, "Over debt"),
    cell: ({ row }) =>
      h("div", {}, row.getValue("priorityOverDebt") ? "Yes" : "No"),
  },
  {
    accessorKey: "ignoreMinBalance",
    header: () => h("div", {}, "Ignore min"),
    cell: ({ row }) =>
      h("div", {}, row.getValue("ignoreMinBalance") ? "Yes" : "No"),
  },
];

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
      class="flex-1 min-h-0 overflow-auto"
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
      <UTable
        v-model:global-filter="globalFilter"
        :data="savingsGoalsForTable"
        :columns="columns"
        sticky
        :ui="tableUi"
        :loading="listStore.getIsListsLoading"
        loading-color="primary"
        loading-animation="carousel"
      />
    </div>
  </section>
</template>
