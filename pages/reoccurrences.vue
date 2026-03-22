<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";

import {
  formatAccountRegisters,
  formatDate,
  getAccountRegisterLabel,
  getIntervalLabel,
} from "~/lib/utils";
import {
  sortCategoriesForManageList,
  categoryDropdownLabel,
} from "~/lib/categorySelect";
import {
  CATEGORY_FILTER_ALL,
  CATEGORY_FILTER_UNCATEGORIZED,
  entryMatchesCategoryFilter,
} from "~/lib/categoryFilter";
import { shouldSkipViewportTableHeightChange } from "~/lib/viewportTableMaxHeight";
import type { Reoccurrence } from "~/types/types";
import type { ModalReoccurrenceProps } from "~/components/modals/EditReoccurrence.vue";

const ModalsEditReoccurrence = defineAsyncComponent(
  () => import("~/components/modals/EditReoccurrence.vue")
);

definePageMeta({
  middleware: "auth",
});

const listStore = useListStore();
const authStore = useAuthStore();
const toast = useToast();

/** Root `overflow-auto` + table `overflow-clip` break sticky headers when the real scroll is the outer wrapper. */
const tableUi = ref({
  root: "!overflow-visible relative min-h-0",
  base: "!overflow-visible min-w-full",
  /** `tbody` uses `isolate` in the default theme; keep header above row backgrounds while sticky. */
  thead: "!z-30",
  tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
});

const overlay = useOverlay();
const modal = overlay.create(ModalsEditReoccurrence);
const { todayISOString } = useToday();
const showShortcuts = ref(false);

function handleTableClick(data: Reoccurrence) {
  const editReoccurrence: ModalReoccurrenceProps = {
    title: `Edit '${data.description}' Reoccurrence`,
    description: "",
    reoccurrence: {
      ...data,
      lastAt: new Date(data.lastAt).toISOString().substring(0, 10),
      endAt: data.endAt
        ? new Date(data.endAt).toISOString().substring(0, 10)
        : undefined,
      amountAdjustmentAnchorAt: data.amountAdjustmentAnchorAt
        ? new Date(data.amountAdjustmentAnchorAt).toISOString().substring(0, 10)
        : undefined,
    },
    callback: (data: Reoccurrence) => {
      listStore.patchReoccurrence(data);
      listStore.fetchLists();
      modal.close()
    },
    cancel: () => modal.close(),
  };
  modal.open(editReoccurrence);
}

function handleAddReoccurrence() {
  const accountRegisters = formatAccountRegisters(listStore.getAccountRegisters);
  const firstAccountRegisterId = accountRegisters[0]?.id ?? 0;
  const monthInterval = listStore.getIntervals.find((i) =>
    /month/i.test(i.name)
  );
  const defaultIntervalId = monthInterval?.id ?? 0;

  const addReoccurrence: ModalReoccurrenceProps = {
    title: `Add Reoccurrence`,
    description: "",
    callback: (data: Reoccurrence) => {
      listStore.patchReoccurrence(data);
      listStore.fetchLists();
      modal.close()
    },
    cancel: () => modal.close(),
    reoccurrence: {
      id: 0,
      accountId: listStore.getAccounts?.[0]?.id,
      description: "",
      amount: 0,
      intervalId: defaultIntervalId,
      accountRegisterId: firstAccountRegisterId,
      lastAt: todayISOString.value || "",
      endAt: undefined,
      intervalCount: 1,
      adjustBeforeIfOnWeekend: false,
      categoryId: null,
      splits: [],
      amountAdjustmentMode: "NONE",
      amountAdjustmentDirection: null,
      amountAdjustmentValue: null,
      amountAdjustmentIntervalId: null,
      amountAdjustmentIntervalCount: 1,
      amountAdjustmentAnchorAt: undefined,
    },
  };
  const modal = overlay.create(ModalsEditReoccurrence);
  modal.open(addReoccurrence);
}

async function handleRecalculate() {
  if (isRecalculating.value) return; // Prevent multiple simultaneous calls

  isRecalculating.value = true;
  try {
    const accountId =
      listStore.budgets.find((b) => b.id === authStore.budgetId)?.accountId ??
      listStore.getAccounts?.[0]?.id;
    const body: {
      accountId?: string;
      budgetId?: number;
    } = { accountId };
    if (authStore.budgetId > 0) {
      body.budgetId = authStore.budgetId;
    }
    const data = await (useNuxtApp().$api as typeof $fetch)<{ success: boolean; entriesCalculated: number; entriesBalance: number; accountRegisters: number }>("/api/recalculate", {
      method: "POST",
      body,
    });

    if (data?.success) {
      // Refresh the lists after recalculation
      await listStore.fetchLists();
      toast.add({
        color: "success",
        description: `Recalculated ${data.entriesCalculated} entries across ${data.accountRegisters} account${data.accountRegisters === 1 ? "" : "s"}.`,
      });
    }
  } catch (error) {
    console.error("Recalculation failed:", error);
    toast.add({
      color: "error",
      description: "Recalculation failed. Please try again.",
    });
  } finally {
    isRecalculating.value = false;
  }
}

const columns: TableColumn<Reoccurrence>[] = [
  {
    accessorKey: "accountRegisterId",
    header: () => h("div", {}, "Account"),
    cell: ({ row }) =>
      getAccountRegisterLabel(
        row.getValue("accountRegisterId"),
        listStore.getAccountRegisters
      ),
  },
  {
    accessorKey: "intervalId",
    header: () => h("div", {}, "Interval"),
    cell: ({ row }) =>
      getIntervalLabel(row.getValue("intervalId"), listStore.getIntervals),
  },
  {
    accessorKey: "categoryId",
    header: () => h("div", {}, "Category"),
    cell: ({ row }) => {
      const id = row.getValue("categoryId") as string | null | undefined;
      if (!id) return h("div", { class: "text-gray-500" }, "—");
      const cat = listStore.getCategories.find((c) => c.id === id);
      return h("div", {}, cat?.name ?? id);
    },
  },
  {
    accessorKey: "description",
    header: () => h("div", {}, "Description"),
    cell: ({ row }) =>
      h(
        "div",
        {
          class: "cursor-pointer font-semibold text-white",
          onClick: () => handleTableClick(row.original),
        },
        row.getValue("description")
      ),
  },
  {
    accessorKey: "amount",
    header: () => h("div", { class: "text-right" }, "Amount"),
    cell: ({ row }) => {
      const className = `text-right ${Number.parseInt(String(row.getValue("amount")), 10) < 0
        ? "dark:text-red-300 text-red-700"
        : ""
        }`;

      return h(
        "div",
        { class: className },
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(row.getValue("amount"))
      );
    },
  },
  {
    accessorKey: "lastAt",
    header: () => h("div", { class: "text-right" }, "Last run"),
    cell: ({ row }) => {
      return h(
        "div",
        { class: "text-right" },
        formatDate(row.getValue("lastAt"))
      );
    },
  },
];

const globalFilter = ref("");
const categoryFilter = ref(CATEGORY_FILTER_ALL);
const combinedTableFilterRef = ref<{
  collapse: () => void;
  expandAndFocus: () => Promise<void>;
} | null>(null);

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

const reoccurrencesForTable = computed(() =>
  listStore.getReoccurrencesForCurrentBudget.filter((r) =>
    entryMatchesCategoryFilter(
      r.categoryId,
      categoryFilter.value,
      listStore.getCategories,
    ),
  ),
);

defineShortcuts({
  escape: {
    usingInput: true,
    handler: () => {
      globalFilter.value = "";
      categoryFilter.value = CATEGORY_FILTER_ALL;
      combinedTableFilterRef.value?.collapse();
    },
  },
  meta_a: () => handleAddReoccurrence(),
  meta_f: () => {
    combinedTableFilterRef.value?.expandAndFocus()?.catch(() => {});
  },
});

const isRecalculating = ref(false);
const sectionEl = ref<HTMLElement | null>(null);
const controlsEl = ref<HTMLElement | null>(null);
const tableHostEl = ref<HTMLElement | null>(null);
const tableViewportMaxHeight = ref(
  "calc(100dvh - var(--ui-header-height) - 12rem)"
);
const tableViewportAvailablePx = ref<number | null>(null);

let tableResizeObserver: ResizeObserver | null = null;
let tableViewportFrameId: number | null = null;

function updateTableViewportMaxHeight() {
  if (!tableHostEl.value) return;

  if (tableViewportFrameId != null) {
    cancelAnimationFrame(tableViewportFrameId);
  }

  tableViewportFrameId = requestAnimationFrame(() => {
    tableViewportFrameId = null;
    const tableTop = tableHostEl.value?.getBoundingClientRect().top ?? 0;
    const bottomSpacing = 16;
    const available = Math.max(
      220,
      Math.floor(window.innerHeight - tableTop - bottomSpacing)
    );
    if (shouldSkipViewportTableHeightChange(available, tableViewportAvailablePx.value)) {
      return;
    }
    tableViewportAvailablePx.value = available;
    tableViewportMaxHeight.value = `${available}px`;
  });
}

onMounted(async () => {
  import("~/components/modals/EditReoccurrence.vue").catch(() => {});
  await nextTick();
  updateTableViewportMaxHeight();
  window.addEventListener("resize", updateTableViewportMaxHeight);

  tableResizeObserver = new ResizeObserver(() => {
    updateTableViewportMaxHeight();
  });

  if (sectionEl.value) {
    tableResizeObserver.observe(sectionEl.value);
  }
  if (controlsEl.value) {
    tableResizeObserver.observe(controlsEl.value);
  }
});

watch(
  () => listStore.getIsListsLoading,
  async () => {
    await nextTick();
    updateTableViewportMaxHeight();
  }
);

watch(
  () => listStore.getReoccurrencesForCurrentBudget.length,
  async () => {
    await nextTick();
    updateTableViewportMaxHeight();
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateTableViewportMaxHeight);

  if (tableResizeObserver) {
    tableResizeObserver.disconnect();
    tableResizeObserver = null;
  }

  if (tableViewportFrameId != null) {
    cancelAnimationFrame(tableViewportFrameId);
    tableViewportFrameId = null;
  }
});
</script>

<template lang="pug">
  section(ref="sectionEl" class="m-4")
    div(ref="controlsEl" class="w-full min-w-0 flex flex-wrap xl:flex-nowrap items-center gap-2 mb-4")
      RegisterListToolbar(
        v-model:global-filter="globalFilter"
        v-model:show-shortcuts="showShortcuts"
        :show-refresh="false"
        filter-class="min-w-[8rem] sm:max-w-48 lg:max-w-48 grow"
        add-tooltip="Add recurring entry"
        add-title="Add recurring entry"
        add-aria-label="Add recurring entry"
        @add="handleAddReoccurrence"
      )
        template(#middle)
          UTooltip(text="Recalculate forecast" :delay-duration="150")
            UButton(
              color="error"
              size="sm"
              square
              icon="i-lucide-calculator"
              title="Recalculate forecast"
              aria-label="Recalculate forecast"
              @click="handleRecalculate"
              :loading="isRecalculating"
              :disabled="isRecalculating"
            )
        template(#filter)
          FiltersCombinedGlobalCategoryFilter(
            ref="combinedTableFilterRef"
            v-model:global-filter="globalFilter"
            v-model:category-filter="categoryFilter"
            :category-items="categoryFilterSelectItems"
            filter-input-id="search"
            input-class="min-w-[8rem] sm:max-w-48 lg:max-w-48 grow"
          )

    UCard(v-if="showShortcuts" class="mb-4")
      template(#header)
        h3(class="font-semibold") Keyboard shortcuts
      ul(class="space-y-2 text-sm")
        li Clear text &amp; category filters: ⎋
        li Add reoccurrence: ⌘ + A
        li Open filters &amp; focus search: ⌘ + F

    UCard(v-if="listStore.getReoccurrencesForCurrentBudget.length === 0 && !listStore.getIsListsLoading" class="mb-4")
      template(#header)
        h3(class="font-semibold") No recurring entries yet
      p(class="frog-text-muted mb-4") Add recurring income and bills so forecasts stay accurate without manual entry.
      UButton(color="primary" size="sm" @click="handleAddReoccurrence") Add first recurring entry

    div(v-if="listStore.getReoccurrencesForCurrentBudget.length > 0 || listStore.getIsListsLoading" ref="tableHostEl" class="flex-1 min-h-0 overflow-auto" :style="{ maxHeight: tableViewportMaxHeight }")
      UAlert(
        v-if="listStore.getReoccurrencesForCurrentBudget.length > 0 && reoccurrencesForTable.length === 0"
        class="mb-2"
        color="neutral"
        variant="subtle"
        title="No recurring items match this category filter"
        description="Choose All categories, Uncategorized, or another category.")
      UTable(
        class="h-full"
        v-model:global-filter="globalFilter"
        :data="reoccurrencesForTable"
        :columns="columns"
        sticky
        :ui="tableUi"
        :loading="listStore.getIsListsLoading"
        loading-color="primary"
        loading-animation="carousel")
</template>
