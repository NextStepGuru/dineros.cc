<script setup lang="ts">
import { h, resolveComponent } from "vue";
import { formatAccountRegisters, formatDate } from "~/lib/utils";
import {
  buildSortedCategorySelectItems,
  categoryDropdownLabel,
  sortCategoriesForManageList,
} from "~/lib/categorySelect";
import {
  CATEGORY_FILTER_ALL,
  CATEGORY_FILTER_UNCATEGORIZED,
  entryMatchesCategoryFilter,
} from "~/lib/categoryFilter";
import type { TableColumn } from "@nuxt/ui";
import type {
  AccountRegister,
  RegisterEntry,
  Reoccurrence,
} from "~/types/types";
import type { ModalRegisterEntryProps } from "~/components/modals/EditRegisterEntry.vue";
import type { ModalReoccurrenceProps } from "~/components/modals/EditReoccurrence.vue";
import type { MatchRegisterEntryReoccurrenceProps } from "~/components/modals/MatchRegisterEntryReoccurrence.vue";
import CombinedGlobalCategoryFilter from "~/components/filters/CombinedGlobalCategoryFilter.vue";
import { useSnapshotMode } from "~/composables/useSnapshotMode";

const ModalsEditRegisterEntry = defineAsyncComponent(
  () => import("~/components/modals/EditRegisterEntry.vue"),
);
const ModalsEditReoccurrence = defineAsyncComponent(
  () => import("~/components/modals/EditReoccurrence.vue"),
);
const ModalsMatchRegisterEntryReoccurrence = defineAsyncComponent(
  () => import("~/components/modals/MatchRegisterEntryReoccurrence.vue"),
);

const UButton = resolveComponent("UButton");
const UTooltip = resolveComponent("UTooltip");

const overlay = useOverlay();
const route = useRoute();
const toast = useToast();
const selectedTab = ref("future");
const { todayISOString } = useToday();

definePageMeta({
  path: "/register/:id?",

  middleware: "auth",
});

const listStore = useListStore();
const authStore = useAuthStore();
const { $api } = useNuxtApp();
const snapshotMode = useSnapshotMode();
const {
  isSnapshotMode,
  activeSnapshotCreatedAt,
  selectedSnapshotValue,
  snapshotViewItems,
  exitSnapshotView,
} = snapshotMode;
const selectedSnapshotLabel = computed(
  () =>
    snapshotViewItems.value.find((i) => i.value === selectedSnapshotValue.value)
      ?.label ?? "Live",
);
const snapshotMenuItems = computed(() => [
  snapshotViewItems.value.map((item) => ({
    label: item.label,
    icon:
      selectedSnapshotValue.value === item.value
        ? "i-lucide-check"
        : "i-lucide-circle",
    onSelect: () => {
      selectedSnapshotValue.value = item.value;
    },
  })),
]);

const registersForRegisterPage = computed((): AccountRegister[] =>
  snapshotMode.isSnapshotMode.value &&
  snapshotMode.syntheticAccountRegisters.value.length > 0
    ? snapshotMode.syntheticAccountRegisters.value
    : listStore.getAccountRegisters,
);

const REGISTER_ONBOARDING_DISMISS_KEY = "dineros_register_onboarding_dismissed";
const REGISTER_RECALC_ONCE_KEY = "dineros_register_recalc_once";

const onboardingDismissed = ref(false);
const recalcCompletedOnce = ref(false);

function readOnboardingLocal() {
  if (!import.meta.client) return;
  try {
    onboardingDismissed.value =
      localStorage.getItem(REGISTER_ONBOARDING_DISMISS_KEY) === "1";
    recalcCompletedOnce.value =
      localStorage.getItem(REGISTER_RECALC_ONCE_KEY) === "1";
  } catch {
    /* ignore */
  }
}

function dismissRegisterOnboarding() {
  onboardingDismissed.value = true;
  try {
    localStorage.setItem(REGISTER_ONBOARDING_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

function printRegisterPage() {
  if (import.meta.client) window.print();
}

onMounted(() => {
  readOnboardingLocal();
});

const mainAccountCount = computed(
  () =>
    registersForRegisterPage.value.filter((r) => !r.subAccountRegisterId)
      .length,
);

const showAccountSelector = computed(
  () => tableEntries.value.length > 0 || mainAccountCount.value > 1,
);

// Account options for dropdown: label (name) + balanceFormatted for right-aligned balance in menu
const accountRegisterOptionsWithBalance = computed(() => {
  const formatted = formatAccountRegisters(registersForRegisterPage.value);
  return formatted.map((r) => {
    const balanceRaw = Number(r.latestBalance ?? 0);
    return {
      ...r,
      label: r.name,
      balanceFormatted: formatCurrency(balanceRaw),
      balanceRaw,
    };
  });
});

function balanceColorClass(balance: number) {
  if (balance < 0) return "text-red-600 dark:text-red-400";
  if (balance > 0) return "text-green-600 dark:text-green-400";
  return "text-muted";
}

const selectedAccountOption = computed(() =>
  accountRegisterOptionsWithBalance.value.find(
    (r) => r.id === accountRegisterId.value,
  ),
);

const hasReoccurrences = computed(() => listStore.getReoccurrences.length > 0);

const plaidLinked = computed(() => authStore.hasPlaidConnected);

const showRegisterOnboarding = computed(() => {
  if (snapshotMode.isSnapshotMode.value) return false;
  if (onboardingDismissed.value) return false;
  if (!listStore.getAccountRegisters.length) return false;
  if (isInitialLoading.value) return false;
  return tableEntries.value.length === 0;
});

onBeforeMount(async () => {
  const regs = listStore.getAccountRegisters;
  if (regs.length === 0) {
    await navigateTo("/account-registers?onboarding=1");
    return;
  }

  if (route.params.id === "") {
    const firstId = regs[0]?.id;
    if (firstId != null) {
      await navigateTo(`/register/${firstId}`);
    }
  }
});

const accountRegisterId = ref<number>(
  route.params.id === "" || Array.isArray(route.params.id)
    ? 0
    : parseInt(route.params.id),
);

// Watch for changes to accountRegisterId and navigate to the new route
watch(accountRegisterId, async (newId) => {
  if (newId) {
    await navigateTo(`/register/${newId}`);
  }
});

watch(authStore, async () => {
  const regs = listStore.getAccountRegisters;
  if (regs.length === 0) {
    await navigateTo("/account-registers?onboarding=1");
    return;
  }
  const verify = regs.filter(
    (item) =>
      item.budgetId === authStore.getBudgetId && item.id === +route.params.id,
  );
  if (!verify.length && regs.length > 0) {
    const target = regs[0].id;
    if (target != null) {
      await navigateTo(`/register/${target}`);
    }
  }
});

// Infinite scrolling state
const currentSkip = ref(0);
const pageSize = 500; // Number of records per page
const hasMoreData = ref(true);
const isLoadingMore = ref(false);
const isInitialLoading = ref(false);

// Progressive loading: Quick load first (50 records), then full load
const accountEntries = shallowRef<{
  entries: RegisterEntry[];
  lowest: RegisterEntry;
  highest: RegisterEntry;
  isPartialLoad?: boolean;
}>({ entries: [], lowest: {} as RegisterEntry, highest: {} as RegisterEntry });

const isQuickLoading = ref(false);
const isFullLoading = ref(false);
const isPartialLoad = ref(false);
const isRefreshLoading = ref(false);

// Direct reactive reference for table data
const tableEntries = ref<RegisterEntry[]>([]);
const tableKey = ref(0); // Force table re-render

// Load initial data
const loadInitialEntries = async () => {
  isInitialLoading.value = true;
  currentSkip.value = 0;
  hasMoreData.value = true;
  tableEntries.value = [];
  try {
    if (snapshotMode.isSnapshotMode.value) {
      const rsid =
        snapshotMode.registerSnapshotIdByRegisterId.value[
          accountRegisterId.value
        ];
      if (!rsid) {
        accountEntries.value = {
          entries: [],
          lowest: {} as RegisterEntry,
          highest: {} as RegisterEntry,
        };
        hasMoreData.value = false;
        tableKey.value++;
        return;
      }
      const data = await (useNuxtApp().$api as typeof $fetch)<{
        entries: RegisterEntry[];
        lowest?: RegisterEntry;
        highest?: RegisterEntry;
      }>(`/api/snapshot-register/${rsid}`);
      if (data) {
        accountEntries.value = {
          entries: [...(data.entries || [])],
          lowest: data.lowest ?? ({} as RegisterEntry),
          highest: data.highest ?? ({} as RegisterEntry),
        };
        tableEntries.value = data.entries ? [...data.entries] : [];
        hasMoreData.value = false;
        currentSkip.value = data.entries?.length || 0;
        tableKey.value++;
      }
      return;
    }

    // use $api (not useAPI) so request resolves; useAPI/useFetch was hanging after nav (Nuxt 4)
    const data = await (useNuxtApp().$api as typeof $fetch)<{
      entries: RegisterEntry[];
      lowest: RegisterEntry;
      highest: RegisterEntry;
      isPartialLoad: boolean;
      hasMore: boolean;
    }>("/api/register", {
      query: {
        accountRegisterId: accountRegisterId.value,
        direction: selectedTab.value,
        loadMode: "full",
        skip: 0,
        take: pageSize,
      },
    });

    if (data) {
      // Update both accountEntries and tableEntries directly
      accountEntries.value = {
        entries: [...(data.entries || [])],
        lowest: data.lowest,
        highest: data.highest,
        isPartialLoad: data.isPartialLoad,
      };

      tableEntries.value = data.entries ? [...data.entries] : [];
      hasMoreData.value = data.hasMore || false;
      currentSkip.value = data.entries?.length || 0;

      // Force table re-render by updating key
      tableKey.value++;
    }
  } catch (error) {
    console.error("Initial load failed:", error);
  } finally {
    isInitialLoading.value = false;
  }
};

// Load more data for infinite scrolling
const loadMoreEntries = async () => {
  if (snapshotMode.isSnapshotMode.value) return;
  if (isLoadingMore.value || !hasMoreData.value) return;

  isLoadingMore.value = true;
  try {
    const data = await (useNuxtApp().$api as typeof $fetch)<{
      entries: RegisterEntry[];
      lowest: RegisterEntry;
      highest: RegisterEntry;
      isPartialLoad: boolean;
      hasMore: boolean;
    }>("/api/register", {
      query: {
        accountRegisterId: accountRegisterId.value,
        direction: selectedTab.value,
        loadMode: "full",
        skip: currentSkip.value,
        take: pageSize,
      },
    });

    if (data?.entries?.length > 0) {
      // Append new entries to existing ones
      tableEntries.value = [...tableEntries.value, ...data.entries];
      hasMoreData.value = data.hasMore || false;
      currentSkip.value += data.entries.length;

      // Update lowest/highest if needed
      if (
        data.lowest &&
        (!accountEntries.value.lowest ||
          data.lowest.balance < accountEntries.value.lowest.balance)
      ) {
        accountEntries.value.lowest = data.lowest;
      }
      if (
        data.highest &&
        (!accountEntries.value.highest ||
          data.highest.balance > accountEntries.value.highest.balance)
      ) {
        accountEntries.value.highest = data.highest;
      }
    } else {
      hasMoreData.value = false;
    }
  } catch (error) {
    console.error("Load more failed:", error);
  } finally {
    isLoadingMore.value = false;
  }
};

// Handle scroll events for infinite scrolling
const handleScroll = (event?: Event) => {
  const tableElement =
    (event?.target as HTMLElement | null) ??
    registerTableViewportEl.value ??
    tableRef.value?.$el;
  if (!tableElement) return;

  const scrollTop = tableElement.scrollTop;
  const scrollHeight = tableElement.scrollHeight;
  const clientHeight = tableElement.clientHeight;

  // Load more when user scrolls to 80% of the content
  if (
    scrollTop + clientHeight >= scrollHeight * 0.8 &&
    hasMoreData.value &&
    !isLoadingMore.value
  ) {
    loadMoreEntries();
  }
};

// Simplified: just load initial data directly
const refreshAccountEntries = async () => {
  isRefreshLoading.value = true;
  try {
    await loadInitialEntries();
  } finally {
    isRefreshLoading.value = false;
  }
};

const reoccurrenceModal = overlay.create(ModalsEditReoccurrence);
const matchToRecurrenceModal = overlay.create(
  ModalsMatchRegisterEntryReoccurrence,
);

function ensureReoccurrenceDescription(text: string): string {
  const t = text.trim();
  if (t.length >= 3) return t;
  if (t.length > 0) return `${t} ··`;
  return "Bank transaction";
}

function openReoccurrenceFromPlaidEntry(entry: RegisterEntry) {
  if (!entry.id) {
    toast.add({
      color: "error",
      description: "This row cannot be linked yet.",
    });
    return;
  }
  const reg = registersForRegisterPage.value.find(
    (r) => r.id === entry.accountRegisterId,
  );
  const accountId = reg?.accountId;
  if (!accountId) {
    toast.add({
      color: "error",
      description: "Account not found for this register.",
    });
    return;
  }
  const monthInterval = listStore.getIntervals.find((i) =>
    /month/i.test(i.name),
  );
  const defaultIntervalId = monthInterval?.id ?? 0;
  if (!defaultIntervalId) {
    toast.add({
      color: "error",
      description: "No billing interval available.",
    });
    return;
  }

  const lastAt = formatDate(entry.createdAt) || todayISOString.value;

  const propsPayload: ModalReoccurrenceProps = {
    title: "New recurrence from import",
    description: "Adjust the schedule if needed, then save to link this row.",
    cancel: () => reoccurrenceModal.close(),
    reoccurrence: {
      id: 0,
      accountId,
      accountRegisterId: entry.accountRegisterId,
      description: ensureReoccurrenceDescription(entry.description ?? ""),
      amount: Number(entry.amount),
      intervalId: defaultIntervalId,
      lastAt,
      endAt: undefined,
      intervalCount: 1,
      adjustBeforeIfOnWeekend: false,
      categoryId: entry.categoryId ?? null,
      splits: [],
    },
    callback: async (created: Reoccurrence) => {
      listStore.patchReoccurrence(created);
      listStore.fetchLists();
      try {
        await ($api as typeof $fetch)("/api/register-entry", {
          method: "patch",
          body: {
            registerEntryId: entry.id,
            accountRegisterId: entry.accountRegisterId,
            reoccurrenceId: created.id,
          },
        });
        toast.add({
          color: "success",
          description: "Recurrence created and linked to this transaction.",
        });
        await refreshAccountEntries();
      } catch {
        toast.add({
          color: "error",
          description:
            "Recurrence was saved but linking this row failed. Set recurrence from Edit entry.",
        });
      }
      reoccurrenceModal.close();
    },
  };
  reoccurrenceModal.open(propsPayload);
}

function openMatchToRecurrence(entry: RegisterEntry) {
  if (!entry.id) {
    toast.add({
      color: "error",
      description: "This row cannot be linked yet.",
    });
    return;
  }
  const payload: MatchRegisterEntryReoccurrenceProps = {
    registerEntry: entry,
    cancel: () => matchToRecurrenceModal.close(),
    callback: async () => {
      await refreshAccountEntries();
      matchToRecurrenceModal.close();
    },
  };
  matchToRecurrenceModal.open(payload);
}

// Computed status for compatibility
const accountEntriesStatus = computed(() => {
  if (isQuickLoading.value) return "pending";
  if (isInitialLoading.value && !tableEntries.value.length) return "pending";
  if (tableEntries.value.length > 0) return "success";
  return "idle";
});

// Trigger loading when accountRegisterId or selectedTab changes (or snapshot / mapping)
watch(
  [
    accountRegisterId,
    selectedTab,
    () => snapshotMode.isSnapshotMode.value,
    () =>
      snapshotMode.registerSnapshotIdByRegisterId.value[
        accountRegisterId.value
      ] ?? 0,
  ],
  () => {
    void refreshAccountEntries();
  },
  { immediate: true },
);

const lowestEntry = computed(() => accountEntries?.value?.lowest);
const highestEntry = computed(() => accountEntries?.value?.highest);

const currentAccountRegister = computed(() =>
  registersForRegisterPage.value.find(
    (item) => item.id === accountRegisterId.value,
  ),
);

const currentType = computed(() =>
  listStore.getAccountTypes.find(
    (item) => item.id === currentAccountRegister.value?.typeId,
  ),
);

// Determine if any data is still loading
const isLoading = computed(
  () => isQuickLoading.value || isFullLoading.value || isInitialLoading.value,
);

// Add scroll event listener when table is mounted
onMounted(() => {
  updateRegisterTableViewportMaxHeight();
  window.addEventListener("resize", updateRegisterTableViewportMaxHeight);
  registerResizeObserver = new ResizeObserver(() => {
    updateRegisterTableViewportMaxHeight();
  });
  if (registerSectionEl.value) {
    registerResizeObserver.observe(registerSectionEl.value);
  }
  if (registerTabsEl.value) {
    registerResizeObserver.observe(registerTabsEl.value);
  }
});

// Clean up scroll event listener
onUnmounted(() => {
  window.removeEventListener("resize", updateRegisterTableViewportMaxHeight);
  if (registerResizeObserver) {
    registerResizeObserver.disconnect();
    registerResizeObserver = null;
  }
  if (registerViewportFrameId != null) {
    cancelAnimationFrame(registerViewportFrameId);
    registerViewportFrameId = null;
  }
});

/** See `reoccurrences.vue` — inner overflow/clipping breaks thead sticky vs outer scroll viewport. */
const tableUi = ref({
  root: "!overflow-visible relative min-h-0",
  base: "!overflow-visible min-w-full",
  thead: "!z-30",
  tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
});

/** Plaid-linked rows until cleared, reconciled, or matched to a recurrence (recurring-only rows have no plaidId). */
function isPlaidImportAwaitingReview(entry: RegisterEntry): boolean {
  if (entry.id?.startsWith("snap-")) return false;
  if (!entry.plaidId) return false;
  if (entry.isBalanceEntry) return false;
  if (entry.reoccurrenceId != null) return false;
  if (entry.isCleared || entry.isReconciled) return false;
  return true;
}

const columns: TableColumn<RegisterEntry>[] = [
  {
    id: "importReview",
    accessorFn: (row) => row.id ?? "",
    meta: {
      class: {
        th: "w-4 max-w-4 !px-0",
        td: "w-4 max-w-4 !px-0",
      },
    },
    header: () =>
      h(
        "div",
        {
          class: "w-4 text-center text-muted",
          title:
            "Amber dot: bank import not reviewed yet — clear, reconcile, or match to a recurrence.",
        },
        "",
      ),
    cell: ({ row }) => {
      const show = isPlaidImportAwaitingReview(row.original);
      const dotLabel =
        "Bank import not reviewed yet. Clear, reconcile, or match to a recurrence using the row actions.";
      return h("div", { class: "flex justify-center w-7" }, [
        show
          ? h(
              UTooltip,
              {
                text: dotLabel,
                delayDuration: 200,
              },
              {
                default: () =>
                  h(
                    "span",
                    {
                      class:
                        "inline-flex cursor-default items-center justify-center p-1.5 -m-1 rounded-sm",
                    },
                    [
                      h("span", {
                        class:
                          "inline-block size-2 rounded-full bg-amber-500 dark:bg-amber-400 ring-2 ring-amber-500/25 dark:ring-amber-400/30 shrink-0",
                        role: "img",
                        "aria-label": dotLabel,
                      }),
                    ],
                  ),
              },
            )
          : h("span", { class: "inline-block size-2 shrink-0" }),
      ]);
    },
  },
  {
    accessorKey: "createdAt",
    meta: {
      class: {
        th: "w-24 max-w-24 whitespace-nowrap !pl-0 !pr-2",
        td: "w-24 max-w-24 whitespace-nowrap align-top !pl-0 !pr-2",
      },
    },
    header: () => h("div", { class: "text-right tabular-nums" }, "Date"),
    cell: ({ row }) => {
      return h(
        "div",
        { class: "text-right tabular-nums" },
        formatDate(row.getValue("createdAt")),
      );
    },
  },
  {
    accessorKey: "description",
    meta: {
      class: {
        th: "w-full max-w-[42rem]",
        td: "w-full max-w-[42rem]",
      },
    },
    header: () => h("div", { class: "w-full max-w-[42rem]" }, "Description"),
    cell: ({ row }) => {
      const entry = row.original;
      const showRecurBtn = isPlaidImportAwaitingReview(entry);
      return h("div", { class: "flex items-center gap-1 min-w-0" }, [
        h(
          "div",
          {
            class:
              "cursor-pointer font-bold dark:text-white truncate flex-1 min-w-0",
            onClick: () => handleTableClick(entry),
          },
          row.getValue("description"),
        ),
        ...(showRecurBtn
          ? [
              h(
                UTooltip,
                {
                  text: "Create a recurring rule from this import and link this row to it.",
                  delayDuration: 200,
                },
                {
                  default: () =>
                    h(UButton, {
                      color: "neutral",
                      variant: "ghost",
                      size: "xs",
                      icon: "i-lucide-repeat",
                      class: "shrink-0",
                      "aria-label":
                        "Create recurrence from this import and link this transaction",
                      onClick: (e: Event) => {
                        e.stopPropagation();
                        openReoccurrenceFromPlaidEntry(entry);
                      },
                    }),
                },
              ),
              h(
                UTooltip,
                {
                  text: "Match to an existing recurrence and remember this bank name for the next Plaid sync.",
                  delayDuration: 200,
                },
                {
                  default: () =>
                    h(UButton, {
                      color: "neutral",
                      variant: "ghost",
                      size: "xs",
                      icon: "i-lucide-link",
                      class: "shrink-0",
                      "aria-label":
                        "Match to existing recurrence and save name alias for future syncs",
                      onClick: (e: Event) => {
                        e.stopPropagation();
                        openMatchToRecurrence(entry);
                      },
                    }),
                },
              ),
            ]
          : []),
      ]);
    },
  },
  {
    accessorKey: "categoryId",
    header: () => h("div", { class: "min-w-32" }, "Category"),
    cell: ({ row }) => {
      const categoryId = row.original.categoryId;
      const name =
        categoryId == null
          ? "—"
          : (listStore.getCategories.find((c) => c.id === categoryId)?.name ??
            "—");
      return h("div", { class: "text-muted" }, name);
    },
  },
  {
    accessorKey: "amount",
    header: () => h("div", { class: "text-right" }, "Amount"),
    cell: ({ row }) => {
      const className = `text-right ${
        parseInt(row.getValue("amount")) < 0
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
    accessorKey: "balance",
    header: () => h("div", { class: "text-right" }, "Balance"),
    cell: ({ row }) => {
      const className = `text-right ${
        parseInt(row.getValue("balance")) < 0
          ? "dark:text-red-300 text-red-700"
          : ""
      }`;

      return h(
        "div",
        { class: className },
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(row.getValue("balance")),
      );
    },
  },
];
const modal = overlay.create(ModalsEditRegisterEntry);

function handleTableClick(data: RegisterEntry) {
  if (snapshotMode.isSnapshotMode.value) return;
  const editRegistryEntryProps: ModalRegisterEntryProps = {
    title: `Edit Entry`,
    description: "",
    callback: async () => {
      await refreshAccountEntries();
      modal.close();
    },
    cancel: () => modal.close(),
    registerEntry: {
      ...data,
      createdAt: formatDate(data.createdAt) || "",
    },
  };

  modal.open(editRegistryEntryProps);
}

function handleAddEntry() {
  if (snapshotMode.isSnapshotMode.value) return;
  const editRegistryEntryProps: ModalRegisterEntryProps = {
    title: `Add Entry`,
    description: "",
    callback: async () => {
      await refreshAccountEntries();
      modal.close();
    },
    cancel: () => modal.close(),
    registerEntry: {
      amount: 0,
      createdAt: todayISOString.value,
      accountRegisterId: accountRegisterId.value,
      description: "",
      balance: 0,
      isCleared: false,
      isReconciled: false,
      isProjected: false,
      reoccurrenceId: null,
      isBalanceEntry: false,
      isPending: true,
      categoryId: null,
    },
  };
  const modal = overlay.create(ModalsEditRegisterEntry);
  modal.open(editRegistryEntryProps);
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function scrollToLowestBalance() {
  if (
    !lowestEntry.value ||
    !Number.isFinite(Number(lowestEntry.value.balance)) ||
    !tableEntries.value.length
  )
    return;

  // Find the index of the first entry with the lowest balance
  const targetIndex = tableEntries.value.findIndex(
    (entry) =>
      entry.balance === lowestEntry.value!.balance &&
      entry.createdAt === lowestEntry.value!.createdAt,
  );

  if (targetIndex !== -1 && tableRef.value) {
    // Scroll to the specific row
    const tableElement = tableRef.value.$el;
    const rows = tableElement.querySelectorAll("tbody tr");

    if (rows[targetIndex]) {
      rows[targetIndex].scrollIntoView({
        behavior: "smooth",
        block: "end",
      });

      // Add highlight effect
      rows[targetIndex].classList.add("!bg-yellow-200", "dark:!bg-yellow-800");
      setTimeout(() => {
        rows[targetIndex].classList.remove(
          "!bg-yellow-200",
          "dark:!bg-yellow-800",
        );
      }, 2000);
    }
  }
}

function isSelectedTab(tab: string) {
  const isActive =
    "cursor-pointer px-5 pt-1 pb-2 text-xs text-[var(--ui-primary)] text-left rtl:text-right font-semibold [&:has([role=checkbox])]:pe-0 bg-slate-800 rounded-b-lg border-l border-b border-r border-gray-600 border-b-gray-700 shadow-sm focus:outline-none hover:bg-gray-900";
  const isInactive =
    "cursor-pointer px-5 pt-1 pb-2 text-xs text-[var(--ui-text-muted)] hover:text-white text-left rtl:text-right font-semibold [&:has([role=checkbox])]:pe-0 bg-slate-700 rounded-b-lg border-l border-b border-r border-gray-600 border-b-gray-700 shadow-sm focus:outline-none hover:bg-gray-500";
  return selectedTab.value === tab ? isActive : isInactive;
}

const globalFilter = ref("");
const categoryFilter = ref(CATEGORY_FILTER_ALL);
const tableRef = ref();
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
  const accountId = currentAccountRegister.value?.accountId ?? null;
  const byId = new Map(listStore.getCategories.map((c) => [c.id, c]));
  const pool = accountId
    ? listStore.getCategories.filter((c) => c.accountId === accountId)
    : listStore.getCategories;
  if (accountId && pool.length > 0) {
    for (const row of buildSortedCategorySelectItems(
      listStore.getCategories,
      accountId,
    )) {
      items.push({
        label: row.label,
        value: row.value,
        name: row.name,
      });
    }
  } else {
    for (const c of sortCategoriesForManageList(pool)) {
      const label = categoryDropdownLabel(c.id, byId);
      items.push({
        label,
        value: c.id,
        name: c.name,
      });
    }
  }
  return items;
});

const registerRowsForTable = computed(() =>
  tableEntries.value.filter((e) =>
    entryMatchesCategoryFilter(
      e.categoryId,
      categoryFilter.value,
      listStore.getCategories,
    ),
  ),
);

watch(accountRegisterId, () => {
  categoryFilter.value = CATEGORY_FILTER_ALL;
  combinedTableFilterRef.value?.collapse();
});

defineShortcuts({
  escape: {
    usingInput: true,
    handler: () => {
      globalFilter.value = "";
      categoryFilter.value = CATEGORY_FILTER_ALL;
      combinedTableFilterRef.value?.collapse();
    },
  },
  meta_r: () => refreshAccountEntries(),
  meta_a: () => handleAddEntry(),
  meta_f: () => {
    void combinedTableFilterRef.value?.expandAndFocus();
  },
  meta_shift_r: () => recalcAccount(),
});

const isRecalcAccountLoading = ref(false);
const showShortcuts = ref(false);
const recalcLiveMessage = ref("");
const registerSectionEl = ref<HTMLElement | null>(null);
const registerTableViewportEl = ref<HTMLElement | null>(null);
const registerOnboardingViewportEl = ref<HTMLElement | null>(null);
const registerTabsEl = ref<HTMLElement | null>(null);
const registerTableViewportMaxHeight = ref(
  "calc(100dvh - var(--ui-header-height) - 12rem)",
);
const registerOnboardingMaxHeight = ref(
  "calc(100dvh - var(--ui-header-height) - 12rem)",
);
let registerResizeObserver: ResizeObserver | null = null;
let registerViewportFrameId: number | null = null;

function updateRegisterTableViewportMaxHeight() {
  if (registerViewportFrameId != null) {
    cancelAnimationFrame(registerViewportFrameId);
  }

  registerViewportFrameId = requestAnimationFrame(() => {
    const tabsHeight = registerTabsEl.value?.offsetHeight ?? 0;
    const bottomSpacing = 20;
    if (registerTableViewportEl.value) {
      const tableTop =
        registerTableViewportEl.value.getBoundingClientRect().top ?? 0;
      const available = Math.max(
        220,
        Math.floor(window.innerHeight - tableTop - tabsHeight - bottomSpacing),
      );
      registerTableViewportMaxHeight.value = `${available}px`;
    }
    if (registerOnboardingViewportEl.value) {
      const top =
        registerOnboardingViewportEl.value.getBoundingClientRect().top ?? 0;
      const available = Math.max(
        220,
        Math.floor(window.innerHeight - top - tabsHeight - bottomSpacing),
      );
      registerOnboardingMaxHeight.value = `${available}px`;
    }
  });
}

watch([accountRegisterId, selectedTab], async () => {
  await nextTick();
  updateRegisterTableViewportMaxHeight();
});

watch(
  () => tableEntries.value.length,
  async () => {
    await nextTick();
    updateRegisterTableViewportMaxHeight();
  },
);

watch(showRegisterOnboarding, async (on) => {
  if (on) {
    await nextTick();
    updateRegisterTableViewportMaxHeight();
  }
});

watch(showShortcuts, async () => {
  if (showRegisterOnboarding.value) {
    await nextTick();
    updateRegisterTableViewportMaxHeight();
  }
});

async function recalcAccount() {
  if (snapshotMode.isSnapshotMode.value) return;
  if (isRecalcAccountLoading.value) return; // Prevent multiple simultaneous calls

  isRecalcAccountLoading.value = true;
  try {
    const data = await (useNuxtApp().$api as typeof $fetch)<{
      success: boolean;
      entriesCalculated: number;
      entriesBalance: number;
      accountRegisters: number;
    }>("/api/recalculate", {
      method: "POST",
      body: {
        accountId: currentAccountRegister.value?.accountId,
      },
    });

    if (data?.success) {
      try {
        localStorage.setItem(REGISTER_RECALC_ONCE_KEY, "1");
        recalcCompletedOnce.value = true;
      } catch {
        /* ignore */
      }
      // Refresh the account entries after recalculation
      await refreshAccountEntries();
      const msg = `Recalculated ${data.entriesCalculated} entries across ${data.accountRegisters} account${data.accountRegisters === 1 ? "" : "s"}.`;
      recalcLiveMessage.value = msg;
      toast.add({
        color: "success",
        description: msg,
      });
    }
  } catch (error) {
    console.error("Recalculation failed:", error);
    recalcLiveMessage.value = "Recalculation failed.";
    toast.add({
      color: "error",
      description: "Recalculation failed. Please try again.",
    });
  } finally {
    isRecalcAccountLoading.value = false;
  }
}
</script>

<template lang="pug">
  section.mx-4(ref="registerSectionEl" class="min-w-0")
    div(
      class="sr-only"
      aria-live="polite"
      aria-atomic="true") {{ recalcLiveMessage }}
    UAlert(
      v-if="isSnapshotMode && activeSnapshotCreatedAt"
      color="info"
      variant="subtle"
      class="mt-4"
      :title="`Viewing snapshot (${formatDate(activeSnapshotCreatedAt) ?? ''})`"
    )
      template(#description)
        .flex.flex-wrap.gap-2.items-center
          span Read-only projected register as captured.
          UButton(size="xs" variant="soft" @click="exitSnapshotView") Exit snapshot
    .flex(
      v-if="tableEntries.length > 0 || showAccountSelector"
      class="mt-4 gap-2 items-center flex-wrap xl:flex-nowrap")
      div(v-if="tableEntries.length > 0" class="min-w-0 flex-1 flex items-center gap-2")
        RegisterListToolbar(
          v-model:global-filter="globalFilter"
          v-model:show-shortcuts="showShortcuts"
          :show-add="!isSnapshotMode"
          :show-refresh="!isSnapshotMode"
          :refresh-loading="isRefreshLoading"
          filter-class="min-w-[8rem] sm:max-w-48 lg:max-w-48 grow"
          @add="handleAddEntry"
          @refresh="refreshAccountEntries"
        )
          template(#filter)
            CombinedGlobalCategoryFilter(
              ref="combinedTableFilterRef"
              v-model:global-filter="globalFilter"
              v-model:category-filter="categoryFilter"
              :category-items="categoryFilterSelectItems"
              filter-input-id="search"
              input-class="min-w-[8rem] sm:max-w-48 lg:max-w-48 grow"
            )
          template(#middle)
            UDropdownMenu(:items="snapshotMenuItems")
              UTooltip(:text="`Snapshot view: ${selectedSnapshotLabel}`" :delay-duration="150")
                UButton(
                  variant="soft"
                  size="sm"
                  square
                  icon="i-lucide-camera"
                  :color="isSnapshotMode ? 'primary' : 'neutral'"
                  :title="`Snapshot view: ${selectedSnapshotLabel}`"
                  :aria-label="`Snapshot view: ${selectedSnapshotLabel}`"
                )
            UTooltip(v-if="!isSnapshotMode" text="Recalculate forecast" :delay-duration="150")
              UButton(
                color="error"
                size="sm"
                square
                icon="i-lucide-calculator"
                title="Recalculate forecast"
                aria-label="Recalculate forecast"
                @click="recalcAccount()"
                :loading="isRecalcAccountLoading"
                :aria-busy="isRecalcAccountLoading"
              )

      div(
        v-if="showAccountSelector || (lowestEntry && !currentType?.isCredit && lowestEntry.accountRegisterId === accountRegisterId) || (highestEntry && currentType?.isCredit && highestEntry.accountRegisterId === accountRegisterId)"
        class="basis-full md:basis-auto md:ml-auto shrink min-w-0 flex flex-col items-end gap-1"
      )
        div(v-if="showAccountSelector" class="w-auto max-w-full flex justify-end items-center")
          div(class="text-sm font-medium frog-text-muted mr-2 text-nowrap") Selected Account:
          ClientOnly
            USelectMenu(
              v-model="accountRegisterId"
              value-key="id"
              size="xs"
              class="w-44 sm:w-52 md:w-56 my-0 max-w-[38vw] sm:max-w-none"
              placeholder="Select an Account"
              :items="accountRegisterOptionsWithBalance"
              :search-input="false")
              template(#default)
                span(class="truncate text-default")
                  template(v-if="selectedAccountOption")
                    | {{ selectedAccountOption.label }}
                    span(:class="balanceColorClass(selectedAccountOption.balanceRaw)" class="tabular-nums") {{ selectedAccountOption.balanceFormatted }}
                  span(v-else) …
              template(#item-trailing="{ item }")
                span(:class="['tabular-nums text-right shrink-0', balanceColorClass(item.balanceRaw)]") {{ item.balanceFormatted }}
            template(#fallback)
              span(class="w-full md:w-64 my-0 text-sm text-default")
                template(v-if="selectedAccountOption")
                  | {{ selectedAccountOption.label }}
                  span(:class="balanceColorClass(selectedAccountOption.balanceRaw)" class="tabular-nums") {{ selectedAccountOption.balanceFormatted }}
                span(v-else) …

        div(class="text-muted text-right" v-if="lowestEntry && !currentType?.isCredit && lowestEntry.accountRegisterId === accountRegisterId")
          span The lowest balance of&nbsp;
          b(@click="scrollToLowestBalance" class="cursor-pointer frog-link") {{ formatCurrency(lowestEntry.balance) }}&nbsp;
          span &nbsp;on
          b.text-nowrap &nbsp;{{ formatDate(lowestEntry.createdAt) }}&nbsp;
        div(class="text-muted text-right" v-else-if="highestEntry && currentType?.isCredit && highestEntry.accountRegisterId === accountRegisterId")
          span The loan will be paid off on
          b.text-nowrap &nbsp;{{ formatDate(highestEntry.createdAt) }}&nbsp;

    UCard(v-if="showShortcuts" class="mb-4")
      template(#header)
        h3(class="font-semibold") Keyboard shortcuts
      ul(class="space-y-2 text-sm")
        li Clear text &amp; category filters: ⎋
        li Add entry: ⌘ + A
        li Open filters &amp; focus search: ⌘ + F
        li Refresh register: ⌘ + R
        li Recalculate forecast: ⌘ + Shift + R

    UCard(v-if="listStore.getAccountRegisters.length === 0" class="my-4")
      template(#header)
        h3(class="font-semibold") No accounts yet
      p(class="frog-text-muted mb-4") Create your first account register before adding transactions and forecasts.
      UButton(to="/account-registers" color="primary" size="sm") Add account

    //- Centered first-run checklist (scrolls inside panel only; page does not scroll)
    div(
      v-else-if="showRegisterOnboarding"
      ref="registerOnboardingViewportEl"
      class="w-full flex justify-center min-h-0 overflow-hidden"
      :style="{ height: registerOnboardingMaxHeight, maxHeight: registerOnboardingMaxHeight }"
    )
      div(class="w-full max-w-lg h-full min-h-0 overflow-y-auto overscroll-y-contain py-2 px-1")
        UCard(class="w-full frog-surface-elevated")
          template(#header)
            div(class="text-center space-y-1")
              h2(class="text-lg font-semibold") Set up your forecast
              p(class="text-sm frog-text-muted") Work through these steps once — then your register will fill in automatically.
          ol(class="space-y-6 list-none p-0 m-0")
            li(class="flex gap-3")
              div(class="shrink-0 mt-0.5")
                UIcon(
                  :name="mainAccountCount > 0 ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  :class="mainAccountCount > 0 ? 'text-green-500 size-6' : 'frog-text-muted size-6'"
                )
              div(class="min-w-0 flex-1")
                p(class="font-medium") 1. Create or update your accounts
                p(class="text-sm frog-text-muted mt-1") Add registers, types, and opening balances so projections start from the right place.
                UButton(to="/account-registers" size="xs" color="primary" class="mt-2") Open Accounts
            li(class="flex gap-3")
              div(class="shrink-0 mt-0.5")
                UIcon(
                  :name="hasReoccurrences ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  :class="hasReoccurrences ? 'text-green-500 size-6' : 'frog-text-muted size-6'"
                )
              div(class="min-w-0 flex-1")
                p(class="font-medium") 2. Add recurring items
                p(class="text-sm frog-text-muted mt-1") Examples: paychecks, rent or mortgage, subscriptions (streaming, gym), utilities, loan payments, insurance.
                UButton(to="/reoccurrences" size="xs" color="primary" class="mt-2") Open Recurring
            li(class="flex gap-3")
              div(class="shrink-0 mt-0.5")
                UIcon(
                  :name="recalcCompletedOnce ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  :class="recalcCompletedOnce ? 'text-green-500 size-6' : 'frog-text-muted size-6'"
                )
              div(class="min-w-0 flex-1")
                p(class="font-medium") 3. Recalc — then save a copy
                p(class="text-sm frog-text-muted mt-1") Run Recalc to generate projected entries. Use your browser’s Print dialog (⌘P / Ctrl+P) and choose “Save as PDF” to download a snapshot.
                div(class="flex flex-wrap gap-2 mt-2")
                  UButton(size="xs" color="error" :loading="isRecalcAccountLoading" @click="recalcAccount") Run Recalc
                  UButton(size="xs" variant="soft" @click="printRegisterPage") Print / Save as PDF
            li(class="flex gap-3")
              div(class="shrink-0 mt-0.5")
                UIcon(
                  :name="plaidLinked ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  :class="plaidLinked ? 'text-green-500 size-6' : 'frog-text-muted size-6'"
                )
              div(class="min-w-0 flex-1")
                p(class="font-medium") 4. Link your real accounts
                p(class="text-sm frog-text-muted mt-1") Optional — connect your bank via Plaid to sync balances and reduce manual entry.
                UButton(to="/edit-profile/sync-accounts" size="xs" variant="soft" class="mt-2") Sync accounts
          div(class="mt-6 pt-4 border-t frog-border flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center")
            p(class="text-xs frog-text-muted") Add your first manual entry anytime with Add — or finish the steps above first.
            div(class="flex gap-2")
              UButton(size="xs" variant="ghost" @click="dismissRegisterOnboarding") Skip checklist
              UButton(size="xs" color="info" @click="handleAddEntry") Add entry

    //- Skeleton loading state
    div(v-else-if="isLoading && tableEntries.length === 0" ref="registerTableViewportEl" class="flex-1 overflow-hidden" :style="{ maxHeight: registerTableViewportMaxHeight }")
      //- Table header skeleton
      div(class="flex border-b frog-border p-4")
        div(class="w-7 shrink-0")
          USkeleton(class="h-4 w-2 mx-auto")
        div(class="flex-1")
          USkeleton(class="h-4 w-16")
        div(class="flex-1")
          USkeleton(class="h-4 w-24")
        div(class="flex-1 text-right")
          USkeleton(class="h-4 w-20 ml-auto")
        div(class="flex-1 text-right")
          USkeleton(class="h-4 w-20 ml-auto")

      //- Table rows skeleton
      div(v-for="i in 25" :key="i" class="flex border-b frog-border p-4")
        div(class="w-7 shrink-0")
          USkeleton(class="h-4 w-2 mx-auto")
        div(class="flex-1")
          USkeleton(class="h-4 w-20")
        div(class="flex-1")
          USkeleton(class="h-4 w-32")
        div(class="flex-1 text-right")
          USkeleton(class="h-4 w-16 ml-auto")
        div(class="flex-1 text-right")
          USkeleton(class="h-4 w-16 ml-auto")

    div(v-else-if="tableEntries.length > 0" ref="registerTableViewportEl" class="flex-1 min-w-0 overflow-x-auto overflow-y-auto overscroll-x-contain" :style="{ maxHeight: registerTableViewportMaxHeight }" @scroll="handleScroll")
      UAlert(
        v-if="registerRowsForTable.length === 0"
        class="mb-2"
        color="neutral"
        variant="subtle"
        title="No rows match this category filter"
        description="Choose All categories, Uncategorized, or another category.")
      UTable(
        ref="tableRef"
        :key="tableKey"
        class="h-full min-w-[min(100%,42rem)] sm:min-w-0"
        :data="registerRowsForTable"
        sticky
        v-model:globalFilter="globalFilter"
        :ui="tableUi"
        :columns="columns"
        :loading="accountEntriesStatus === 'pending'"
        loading-color="primary"
        loading-animation="carousel")
    UCard(v-else class="my-4 max-w-lg mx-auto")
      template(#header)
        h3(class="font-semibold") No entries in this register
      p(class="frog-text-muted mb-4") Add your opening balance or first transaction to start forecasting this account.
      div(class="flex gap-3")
        UButton(color="primary" size="sm" @click="handleAddEntry") Add first entry
        UButton(variant="soft" size="sm" @click="refreshAccountEntries()" :loading="isRefreshLoading") Refresh

    // div(v-if="isLoadingMore" class="flex justify-center items-center py-4")
      USpinner(size="sm" color="primary")
      span.ml-2.text-sm.frog-text-muted Loading more entries...

    // div(v-if="!hasMoreData && tableEntries.length > 0" class="flex justify-center items-center py-4 text-sm text-gray-500 dark:text-gray-400")
      span No more entries to load

    //- Tabs (shown after at least one entry exists; hidden in snapshot — data is future-only)
    ul(
      v-if="tableEntries.length > 0 && !isSnapshotMode"
      ref="registerTabsEl"
      class="flex flex-wrap gap-2 -mt-1 ml-1 sm:ml-5 mb-5"
      role="tablist"
      aria-label="Register time range")
      li(role="presentation")
        button(
          type="button"
          role="tab"
          :aria-selected="selectedTab === 'future'"
          :class="isSelectedTab('future')"
          class="min-h-11 min-w-18 sm:min-h-0 sm:min-w-0 touch-manipulation"
          @click="selectedTab = 'future'") Future
      li(role="presentation")
        button(
          type="button"
          role="tab"
          :aria-selected="selectedTab === 'past'"
          :class="isSelectedTab('past')"
          class="min-h-11 min-w-18 sm:min-h-0 sm:min-w-0 touch-manipulation"
          @click="selectedTab = 'past'") Past

</template>
