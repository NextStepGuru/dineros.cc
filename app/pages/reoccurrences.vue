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
import { matchesTableGlobalFilter } from "~/lib/tableGlobalFilterMatch";
import {
  dismissNotification,
  dispatchNotificationsRefresh,
  fetchNotificationSnapshot,
} from "~/lib/notifications";
import type { Reoccurrence } from "~/types/types";
import type { ModalReoccurrenceProps } from "~/components/modals/EditReoccurrence.vue";

const ModalsEditReoccurrence = defineAsyncComponent(
  () => import("~/components/modals/EditReoccurrence.vue"),
);

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Reoccurrences | Dineros" });

const listStore = useListStore();
const authStore = useAuthStore();
const toast = useToast();
const { $api } = useNuxtApp();

type ReoccurrenceHealthIssue = {
  notificationId: number;
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
  occurrenceKey?: string;
};

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
      modal.close();
    },
    cancel: () => modal.close(),
  };
  modal.open(editReoccurrence);
}

function handleAddReoccurrence() {
  const accountRegisters = formatAccountRegisters(
    listStore.getAccountRegisters,
  );
  const firstAccountRegisterId = accountRegisters[0]?.id ?? 0;
  const monthInterval = listStore.getIntervals.find((i) =>
    /month/i.test(i.name),
  );
  const defaultIntervalId = monthInterval?.id ?? 0;

  const addReoccurrence: ModalReoccurrenceProps = {
    title: `Add Reoccurrence`,
    description: "",
    callback: (data: Reoccurrence) => {
      listStore.patchReoccurrence(data);
      listStore.fetchLists();
      modal.close();
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
    const data = await ($api as typeof $fetch)<{
      success: boolean;
      entriesCalculated: number;
      entriesBalance: number;
      accountRegisters: number;
    }>("/api/recalculate", {
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
        listStore.getAccountRegisters,
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
          role: "button",
          tabindex: 0,
          onClick: () => handleTableClick(row.original),
          onKeydown: (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleTableClick(row.original);
            }
          },
        },
        row.getValue("description"),
      ),
  },
  {
    accessorKey: "amount",
    header: () => h("div", { class: "text-right" }, "Amount"),
    cell: ({ row }) => {
      const className = `text-right ${
        Number.parseInt(String(row.getValue("amount")), 10) < 0
          ? "dark:text-red-300 text-red-700"
          : ""
      }`;

      return h(
        "div",
        { class: className },
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(row.getValue("amount")),
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
        formatDate(row.getValue("lastAt")),
      );
    },
  },
];

const globalFilter = useSharedTableGlobalFilter();
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
  listStore.getReoccurrencesForCurrentBudget.filter((r) => {
    const matchesCategory = entryMatchesCategoryFilter(
      r.categoryId,
      categoryFilter.value,
      listStore.getCategories,
    );
    if (!matchesCategory) return false;

    const accountLabel = getAccountRegisterLabel(
      r.accountRegisterId,
      listStore.getAccountRegisters,
    );
    const intervalLabel = getIntervalLabel(
      r.intervalId,
      listStore.getIntervals,
    );
    const categoryLabel =
      r.categoryId == null
        ? "uncategorized"
        : (listStore.getCategories.find((c) => c.id === r.categoryId)?.name ??
          "");

    return matchesTableGlobalFilter(globalFilter.value, [
      r.description ?? "",
      accountLabel,
      intervalLabel,
      categoryLabel,
      formatDate(r.lastAt) ?? "",
      String(r.amount ?? ""),
    ]);
  }),
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
const reoccurrenceHealthLoading = ref(false);
const reoccurrenceHealthIssues = ref<ReoccurrenceHealthIssue[]>([]);
const reoccurrenceActionLoading = ref<Set<number>>(new Set());
const reoccurrenceHealthSummary = computed(() => {
  const total = reoccurrenceHealthIssues.value.length;
  if (total === 0) return "";
  if (total === 1) return "1 recurring rule may need attention.";
  return `${total} recurring rules may need attention.`;
});

async function fetchReoccurrenceHealth() {
  if (!authStore.getBudgetId) {
    reoccurrenceHealthIssues.value = [];
    return;
  }
  reoccurrenceHealthLoading.value = true;
  try {
    const snapshot = await fetchNotificationSnapshot({
      api: $api as typeof $fetch,
      budgetId: authStore.getBudgetId,
      daysAhead: 90,
      timeoutMs: 10000,
    });
    reoccurrenceHealthIssues.value =
      (snapshot.recurringHealthIssues as ReoccurrenceHealthIssue[]) ?? [];
  } catch {
    reoccurrenceHealthIssues.value = [];
  } finally {
    reoccurrenceHealthLoading.value = false;
  }
}

async function dismissRecurringIssue(notificationId: number) {
  if (!authStore.getBudgetId) return;
  reoccurrenceActionLoading.value.add(notificationId);
  try {
    const snapshot = await dismissNotification({
      api: $api as typeof $fetch,
      budgetId: authStore.getBudgetId,
      notificationId,
      status: "dismissed",
    });
    reoccurrenceHealthIssues.value =
      (snapshot.recurringHealthIssues as ReoccurrenceHealthIssue[]) ?? [];
    dispatchNotificationsRefresh({
      count:
        snapshot.total ??
        (snapshot.riskAlerts?.length ?? 0) +
          (snapshot.recurringHealthIssues?.length ?? 0),
      reason: "mutation",
    });
  } finally {
    reoccurrenceActionLoading.value.delete(notificationId);
  }
}

onMounted(async () => {
  import("~/components/modals/EditReoccurrence.vue").catch(() => {});
  await fetchReoccurrenceHealth();
});

watch(
  () => listStore.getReoccurrencesForCurrentBudget.length,
  async () => {
    await fetchReoccurrenceHealth();
  },
);

watch(
  () => authStore.getBudgetId,
  async () => {
    await fetchReoccurrenceHealth();
  },
);
</script>

<template lang="pug">
  section(class="my-4 mx-2")
    h1(class="sr-only") Recurring Entries
    div(class="w-full min-w-0 flex flex-wrap xl:flex-nowrap items-center gap-2 mb-4")
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
            BaseIconButton(
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

    UAlert(
      v-if="!reoccurrenceHealthLoading && reoccurrenceHealthIssues.length > 0"
      class="mb-4"
      color="warning"
      variant="subtle"
      title="Recurring rule health checks"
      :description="reoccurrenceHealthSummary")

    UCard(v-if="listStore.getReoccurrencesForCurrentBudget.length === 0 && !listStore.getIsListsLoading" class="mb-4")
      template(#header)
        h3(class="font-semibold") No recurring entries yet
      p(class="frog-text-muted mb-4") Add recurring income and bills so forecasts stay accurate without manual entry.
      UButton(color="primary" size="sm" @click="handleAddReoccurrence") Add first recurring entry

    UCard(v-if="!reoccurrenceHealthLoading && reoccurrenceHealthIssues.length > 0" class="mb-4")
      template(#header)
        h3(class="font-semibold") Rules to review
      ul(class="space-y-2 text-sm")
        li(v-for="issue in reoccurrenceHealthIssues.slice(0, 8)" :key="`${issue.type}-${issue.reoccurrenceId}`" class="frog-text-muted")
          b(class="frog-text") {{ issue.accountRegisterName }}:
          span &nbsp;{{ issue.description }} — {{ issue.details }}
          UButton(
            size="xs"
            variant="ghost"
            class="ml-2"
            :loading="reoccurrenceActionLoading.has(issue.notificationId)"
            :disabled="reoccurrenceActionLoading.has(issue.notificationId)"
            @click="dismissRecurringIssue(issue.notificationId)") Dismiss

    div(
      v-if="listStore.getReoccurrencesForCurrentBudget.length > 0 || listStore.getIsListsLoading"
      class="reoccurrences-table-outer h-fit mt-2 min-w-0 w-full rounded-md border border-primary/40")
      UAlert(
        v-if="listStore.getReoccurrencesForCurrentBudget.length > 0 && reoccurrencesForTable.length === 0"
        class="mb-2"
        color="neutral"
        variant="subtle"
        title="No recurring items match this category filter"
        description="Choose All categories, Uncategorized, or another category.")
      div(
        v-else-if="listStore.getIsListsLoading && reoccurrencesForTable.length === 0"
        class="flex flex-col min-h-0"
      )
        div(
          class="reoccurrences-inner-head-grid w-full border-t border-default bg-default text-xs sm:text-sm font-semibold text-default"
        )
          div(class="reoccurrences-head-clip px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default")
            USkeleton(class="h-4 w-14")
          div(class="reoccurrences-head-clip px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default")
            USkeleton(class="h-4 w-12")
          div(class="reoccurrences-head-clip px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default")
            USkeleton(class="h-4 w-20")
          div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0")
            USkeleton(class="h-4 w-full max-w-md")
          div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default")
            USkeleton(class="h-4 w-14 ml-auto")
          div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default")
            USkeleton(class="h-4 w-20 ml-auto")
        div(
          v-for="i in 12"
          :key="`reocc-skeleton-${i}`"
          class="reoccurrences-inner-head-grid w-full border-b border-default odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700"
        )
          div(class="p-2 sm:p-4 text-xs sm:text-sm text-muted min-w-0 overflow-hidden")
            USkeleton(class="h-4 w-20 max-w-full")
          div(class="p-2 sm:p-4 text-xs sm:text-sm text-muted min-w-0 overflow-hidden")
            USkeleton(class="h-4 w-16 max-w-full")
          div(class="p-2 sm:p-4 text-xs sm:text-sm text-muted min-w-0 overflow-hidden")
            USkeleton(class="h-4 w-24 max-w-full")
          div(class="min-w-0 p-2 sm:p-4 text-xs sm:text-sm")
            USkeleton(class="h-4 max-w-full")
          div(class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap")
            USkeleton(class="h-4 w-16 ml-auto")
          div(class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap")
            USkeleton(class="h-4 w-20 ml-auto")
      table.reoccurrences-main-table(
        v-if="reoccurrencesForTable.length > 0"
        class="w-full min-w-full table-fixed border-separate border-spacing-0 text-xs sm:text-sm"
        aria-label="Recurring entries"
      )
        colgroup
          col(style="width:12%")
          col(style="width:11%")
          col(style="width:18%")
          col(style="width:35%")
          col(style="width:12%")
          col(style="width:12%")
        thead.reoccurrences-sticky-thead
          tr
            th(
              colspan="6"
              scope="colgroup"
              class="reoccurrences-table-controls-th reoccurrences-thead-sticky-th sticky top-(--ui-header-height) z-38 overflow-hidden rounded-t-md border-b border-default bg-default/95 backdrop-blur-md supports-backdrop-filter:bg-default/90 p-0 align-top font-normal"
            )
              div.reoccurrences-sticky-head
                div(class="flex flex-col min-h-0")
                  div(
                    class="reoccurrences-inner-head-grid w-full border-t border-default bg-default text-xs sm:text-sm font-semibold text-default"
                  )
                    div(class="reoccurrences-head-clip px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default text-left") Account
                    div(class="reoccurrences-head-clip px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default text-left") Interval
                    div(class="reoccurrences-head-clip px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default text-left") Category
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0 text-left") Description
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default whitespace-nowrap") Amount
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default whitespace-nowrap") Last run
        tbody
          tr(
            v-for="(row, index) in reoccurrencesForTable"
            :key="row.id ?? `reocc-${index}`"
            class="odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700")
            td.reoccurrences-cell-clip(class="p-2 sm:p-4 text-xs sm:text-sm text-muted border-b border-default") {{ getAccountRegisterLabel(row.accountRegisterId, listStore.getAccountRegisters) }}
            td.reoccurrences-cell-clip(class="p-2 sm:p-4 text-xs sm:text-sm text-muted border-b border-default") {{ getIntervalLabel(row.intervalId, listStore.getIntervals) }}
            td.reoccurrences-cell-clip(class="p-2 sm:p-4 text-xs sm:text-sm text-muted border-b border-default")
              | {{ row.categoryId == null ? "—" : (listStore.getCategories.find((c) => c.id === row.categoryId)?.name ?? row.categoryId) }}
            td(class="min-w-0 p-2 sm:p-4 text-xs sm:text-sm border-b border-default")
              div(
                class="cursor-pointer font-semibold frog-text truncate"
                role="button"
                tabindex="0"
                @click="handleTableClick(row)"
                @keydown.enter.prevent="handleTableClick(row)"
                @keydown.space.prevent="handleTableClick(row)") {{ row.description }}
            td(class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap border-b border-default")
              DollarFormat(:amount="Number(row.amount)")
            td(class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap border-b border-default") {{ formatDate(row.lastAt) }}

</template>

<style scoped>
.reoccurrences-table-outer {
  padding: 0;
}

.reoccurrences-table-controls-th {
  vertical-align: top;
  line-height: 0;
}

.reoccurrences-table-controls-th .reoccurrences-sticky-head {
  line-height: normal;
}

.reoccurrences-main-table thead.reoccurrences-sticky-thead .reoccurrences-thead-sticky-th {
  position: sticky;
  top: var(--ui-header-height);
}

.reoccurrences-main-table tbody tr:last-child td:first-child {
  border-bottom-left-radius: 0.375rem;
}

.reoccurrences-main-table tbody tr:last-child td:last-child {
  border-bottom-right-radius: 0.375rem;
}

.reoccurrences-main-table tbody tr:last-child td:only-child {
  border-bottom-left-radius: 0.375rem;
  border-bottom-right-radius: 0.375rem;
}

/* Same percentages as <colgroup>. */
.reoccurrences-inner-head-grid {
  display: grid;
  grid-template-columns: 12% 11% 18% 35% 12% 12%;
  width: 100%;
}

/* Fixed layout: clip so nowrap text cannot paint over the next column. */
.reoccurrences-head-clip,
.reoccurrences-main-table td.reoccurrences-cell-clip {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .reoccurrences-table-outer {
    overflow-x: auto;
    overflow-y: clip;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
  }

  .reoccurrences-table-outer .reoccurrences-main-table {
    min-width: max(100%, 36rem);
  }
}
</style>
