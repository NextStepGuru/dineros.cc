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
import type { Reoccurrence } from "~/types/types";
import type { ModalReoccurrenceProps } from "~/components/modals/EditReoccurrence.vue";

const ModalsEditReoccurrence = defineAsyncComponent(
  () => import("~/components/modals/EditReoccurrence.vue")
);

definePageMeta({
  middleware: "auth",
});

const listStore = useListStore();
const toast = useToast();

const stripedTheme = ref({
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
    },
  };
  const modal = overlay.create(ModalsEditReoccurrence);
  modal.open(addReoccurrence);
}

async function handleRecalculate() {
  if (isRecalculating.value) return; // Prevent multiple simultaneous calls

  isRecalculating.value = true;
  try {
    const data = await (useNuxtApp().$api as typeof $fetch)<{ success: boolean; entriesCalculated: number; entriesBalance: number; accountRegisters: number }>("/api/recalculate", {
      method: "POST",
      body: {
        accountId: listStore.getAccounts?.[0]?.id,
      },
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
      const className = `text-right ${parseInt(row.getValue("amount")) < 0
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
  listStore.getReoccurrences.filter((r) =>
    entryMatchesCategoryFilter(r.categoryId, categoryFilter.value),
  ),
);

defineShortcuts({
  escape: {
    usingInput: true,
    handler: () => {
      globalFilter.value = "";
      categoryFilter.value = CATEGORY_FILTER_ALL;
    },
  },
  meta_a: () => handleAddReoccurrence(),
  meta_f: () => {
    const search = document.getElementById("search");

    if (search) {
      search.focus();
    }
  },
});

const isRecalculating = ref(false);
const sectionEl = ref<HTMLElement | null>(null);
const controlsEl = ref<HTMLElement | null>(null);
const tableHostEl = ref<HTMLElement | null>(null);
const tableViewportMaxHeight = ref(
  "calc(100dvh - var(--ui-header-height) - 12rem)"
);

let tableResizeObserver: ResizeObserver | null = null;
let tableViewportFrameId: number | null = null;

function updateTableViewportMaxHeight() {
  if (!tableHostEl.value) return;

  if (tableViewportFrameId != null) {
    cancelAnimationFrame(tableViewportFrameId);
  }

  tableViewportFrameId = requestAnimationFrame(() => {
    const tableTop = tableHostEl.value?.getBoundingClientRect().top ?? 0;
    const bottomSpacing = 16;
    const available = Math.max(
      220,
      Math.floor(window.innerHeight - tableTop - bottomSpacing)
    );
    tableViewportMaxHeight.value = `${available}px`;
  });
}

onMounted(async () => {
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
  () => listStore.getReoccurrences.length,
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
    div(ref="controlsEl" class="w-full min-w-0 flex flex-wrap xl:flex-nowrap gap-1 items-center mb-6")
      UTooltip(text="Add recurring entry" :delay-duration="150")
        UButton(
          color="primary"
          size="sm"
          square
          icon="i-lucide-plus"
          title="Add recurring entry"
          aria-label="Add recurring entry"
          @click="handleAddReoccurrence"
        )
      UTooltip(text="Recalculate forecast" :delay-duration="150")
        UButton(
          color="warning"
          size="sm"
          square
          icon="i-lucide-calculator"
          title="Recalculate forecast"
          aria-label="Recalculate forecast"
          @click="handleRecalculate"
          :loading="isRecalculating"
          :disabled="isRecalculating"
        )
      UTooltip(:text="showShortcuts ? 'Hide shortcuts' : 'Show shortcuts'" :delay-duration="150")
        UButton(
          variant="soft"
          size="sm"
          square
          icon="i-lucide-keyboard"
          :color="showShortcuts ? 'primary' : 'neutral'"
          :title="showShortcuts ? 'Hide shortcuts' : 'Show shortcuts'"
          :aria-label="showShortcuts ? 'Hide shortcuts' : 'Show shortcuts'"
          @click="showShortcuts = !showShortcuts"
        )
      UInput(v-model="globalFilter" size="sm" class="min-w-32 max-w-48 grow" placeholder="Filter..." id="search")
      UTooltip(text="Filter by category" :delay-duration="150")
        USelectMenu(
          v-model="categoryFilter"
          :items="categoryFilterSelectItems"
          value-key="value"
          label-key="label"
          :filter-fields="['label', 'name']"
          size="sm"
          class="min-w-40 max-w-[16rem]"
          placeholder="All categories"
          search-placeholder="Search…"
          aria-label="Filter by category")

    UCard(v-if="showShortcuts" class="mb-4")
      template(#header)
        h3(class="font-semibold") Keyboard shortcuts
      ul(class="space-y-2 text-sm")
        li Clear text &amp; category filters: ⎋
        li Add reoccurrence: ⌘ + A
        li Focus filter: ⌘ + F

    UCard(v-if="listStore.getReoccurrences.length === 0 && !listStore.getIsListsLoading" class="mb-4")
      template(#header)
        h3(class="font-semibold") No recurring entries yet
      p(class="frog-text-muted mb-4") Add recurring income and bills so forecasts stay accurate without manual entry.
      UButton(color="primary" size="sm" @click="handleAddReoccurrence") Add first recurring entry

    div(v-if="listStore.getReoccurrences.length > 0 || listStore.getIsListsLoading" ref="tableHostEl" class="flex-1 min-h-0 overflow-auto" :style="{ maxHeight: tableViewportMaxHeight }")
      UAlert(
        v-if="listStore.getReoccurrences.length > 0 && reoccurrencesForTable.length === 0"
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
        :ui="stripedTheme"
        :loading="listStore.getIsListsLoading"
        loading-color="primary"
        loading-animation="carousel")
</template>
