<script setup lang="ts">
import { formatAccountRegisters, formatDate } from "~/lib/utils";
import type { TableColumn } from "@nuxt/ui";
import { ModalsEditRegisterEntry } from "#components";
import type { RegisterEntry } from "~/types/types";
import type { ModalRegisterEntryProps } from "~/components/modals/EditRegisterEntry.vue";

const overlay = useOverlay();
const route = useRoute();
const selectedTab = ref("future");

definePageMeta({
  path: "/register/:id?",

  middleware: "auth",
});

const listStore = useListStore();
const authStore = useAuthStore();

onBeforeMount(async () => {
  if (route.params.id === "") {
    const firstId = formatAccountRegisters(listStore.getAccountRegisters)[0]?.id;
    if (firstId != null) {
      await navigateTo(`/register/${firstId}`);
    }
  }
});

const accountRegisterId = ref<number>(
  route.params.id === "" || Array.isArray(route.params.id)
    ? 0
    : parseInt(route.params.id)
);

// Watch for changes to accountRegisterId and navigate to the new route
watch(accountRegisterId, async (newId) => {
  if (newId) {
    await navigateTo(`/register/${newId}`);
  }
});

watch(authStore, async () => {
  const regs = listStore.getAccountRegisters;
  const verify = regs.filter(
    (item) =>
      item.budgetId === authStore.getBudgetId && item.id === +route.params.id
  );
  if (!verify.length && regs.length > 0) {
    const target = formatAccountRegisters(regs)[0]?.id;
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
const handleScroll = () => {
  if (!tableRef.value) return;

  const tableElement = tableRef.value.$el;
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

// Computed status for compatibility
const accountEntriesStatus = computed(() => {
  if (isQuickLoading.value) return "pending";
  if (isInitialLoading.value && !tableEntries.value.length) return "pending";
  if (tableEntries.value.length > 0) return "success";
  return "idle";
});

// Trigger loading when accountRegisterId or selectedTab changes
watch(
  [accountRegisterId, selectedTab],
  () => {
    refreshAccountEntries();
  },
  { immediate: true }
);

const lowestEntry = computed(() => accountEntries?.value?.lowest);
const highestEntry = computed(() => accountEntries?.value?.highest);

const currentAccountRegister = computed(() =>
  listStore.getAccountRegisters.find(
    (item) => item.id === accountRegisterId.value
  )
);

const currentType = computed(() =>
  listStore.getAccountTypes.find(
    (item) => item.id === currentAccountRegister.value?.typeId
  )
);

// Determine if any data is still loading
const isLoading = computed(
  () => isQuickLoading.value || isFullLoading.value || isInitialLoading.value
);

// Add scroll event listener when table is mounted
onMounted(() => {
  if (tableRef.value) {
    const tableElement = tableRef.value.$el;
    if (tableElement) {
      tableElement.addEventListener("scroll", handleScroll);
    }
  }
});

// Clean up scroll event listener
onUnmounted(() => {
  if (tableRef.value) {
    const tableElement = tableRef.value.$el;
    if (tableElement) {
      tableElement.removeEventListener("scroll", handleScroll);
    }
  }
});

const stripedTheme = ref({
  tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
});

const columns: TableColumn<RegisterEntry>[] = [
  {
    accessorKey: "createdAt",
    header: () => h("div", { class: "text-right" }, "Date"),
    cell: ({ row }) => {
      return h(
        "div",
        { class: "text-right" },
        formatDate(row.getValue("createdAt"))
      );
    },
  },
  {
    accessorKey: "description",
    header: () => h("div", { class: "min-w-lg" }, "Description"),
    cell: ({ row }) => {
      return h(
        "div",
        {
          class: "cursor-pointer font-bold dark:text-white",
          onClick: () => handleTableClick(row.original),
        },
        row.getValue("description")
      );
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
        }).format(row.getValue("amount"))
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
        }).format(row.getValue("balance"))
      );
    },
  },
];
const modal = overlay.create(ModalsEditRegisterEntry);

function handleTableClick(data: RegisterEntry) {
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
      createdAt: new Date().toISOString().substring(0, 10),
      accountRegisterId: accountRegisterId.value,
      description: "",
      balance: 0,
      isCleared: false,
      isReconciled: false,
      isProjected: false,
      reoccurrenceId: null,
      isBalanceEntry: false,
      isPending: true,
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
  if (!lowestEntry.value || !tableEntries.value.length) return;

  // Find the index of the first entry with the lowest balance
  const targetIndex = tableEntries.value.findIndex(
    (entry) =>
      entry.balance === lowestEntry.value.balance &&
      entry.createdAt === lowestEntry.value.createdAt
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
          "dark:!bg-yellow-800"
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

defineShortcuts({
  escape: {
    usingInput: true,
    handler: () => {
      globalFilter.value = "";
    },
  },
  meta_r: () => refreshAccountEntries(),
  meta_a: () => handleAddEntry(),
  meta_f: () => {
    const search = document.getElementById("search");

    if (search) {
      search.focus();
    }
  },
  meta_c: () => recalcAccount(),
});

const globalFilter = ref("");
const tableRef = ref();
const isRecalcAccountLoading = ref(false);

async function recalcAccount() {
  if (isRecalcAccountLoading.value) return; // Prevent multiple simultaneous calls

  isRecalcAccountLoading.value = true;
  try {
    const { data } = await useAPI<{
      success: boolean;
      entriesCalculated: number;
      entriesBalance: number;
      accountRegisters: number;
    }>(() => "/api/recalculate", {
      method: "POST",
      key: `recalculate-${Date.now()}`, // Unique key for each call
      server: false, // Force client-side execution
      body: {
        accountId: currentAccountRegister.value?.accountId,
      },
    });

    if (data.value?.success) {
      // Refresh the account entries after recalculation
      await refreshAccountEntries();
    }
  } catch (error) {
    console.error("Recalculation failed:", error);
  } finally {
    isRecalcAccountLoading.value = false;
  }
}
</script>

<template lang="pug">
  section.mx-4
    .flex(class="flex-col mt-4  md:flex-row md:space-x-4")
      div(class="w-full flex")
        UButton(color="info" size="sm" class="mr-4" @click="handleAddEntry") Add
        UButton(size="sm" class="mr-4" @click="refreshAccountEntries()" :loading="isRefreshLoading") Refresh
        UButton(color="error" size="sm" class="mr-4" @click="recalcAccount()" :loading="isRecalcAccountLoading") Recalc
        UInput(v-model="globalFilter" size="sm" class="w-full lg:max-w-48" placeholder="Filter..." id="search")

      div(class="ml-auto flex justify-center items-center")
        div(class="text-sm font-medium dark:text-gray-500 mt-2 mr-2 text-nowrap") Selected Account:
        ClientOnly
          USelect(
            v-model="accountRegisterId"
            size="xs"
            class="w-full md:w-64 my-0"
            placeholder="Select an Account"
            :items="formatAccountRegisters(listStore.getAccountRegisters)"
            valueKey="id"
            labelKey="name")
          template(#fallback)
            span(class="w-full md:w-64 my-0 text-sm text-default") {{ formatAccountRegisters(listStore.getAccountRegisters).find((r) => r.id === accountRegisterId)?.name ?? '…' }}

    .w-full(class="text-[var(--ui-text-muted)] text-right" v-if="lowestEntry && !currentType?.isCredit && lowestEntry.accountRegisterId === accountRegisterId")
      span The lowest balance of&nbsp;
      b(@click="scrollToLowestBalance" class="cursor-pointer hover:text-blue-500") {{ formatCurrency(lowestEntry.balance) }}&nbsp;
      span &nbsp;on
      b.text-nowrap &nbsp;{{ formatDate(lowestEntry.createdAt) }}&nbsp;
    .w-full(class="text-[var(--ui-text-muted)] text-right" v-else-if="highestEntry && currentType?.isCredit && highestEntry.accountRegisterId === accountRegisterId")
      span The loan will be paid off on
      b.text-nowrap &nbsp;{{ formatDate(highestEntry.createdAt) }}&nbsp;
    .w-full(class="text-[var(--ui-text-muted)] text-right" v-else="") &nbsp;

    //- Skeleton loading state
    div(v-if="isLoading && tableEntries.length === 0" class="flex-1 max-h-[calc(100vh-200px)] overflow-hidden")
      //- Table header skeleton
      div(class="flex border-b border-gray-200 dark:border-gray-700 p-4")
        div(class="flex-1")
          USkeleton(class="h-4 w-16")
        div(class="flex-1")
          USkeleton(class="h-4 w-24")
        div(class="flex-1 text-right")
          USkeleton(class="h-4 w-20 ml-auto")
        div(class="flex-1 text-right")
          USkeleton(class="h-4 w-20 ml-auto")

      //- Table rows skeleton
      div(v-for="i in 25" :key="i" class="flex border-b border-gray-200 dark:border-gray-700 p-4")
        div(class="flex-1")
          USkeleton(class="h-4 w-20")
        div(class="flex-1")
          USkeleton(class="h-4 w-32")
        div(class="flex-1 text-right")
          USkeleton(class="h-4 w-16 ml-auto")
        div(class="flex-1 text-right")
          USkeleton(class="h-4 w-16 ml-auto")

    UTable(
      ref="tableRef"
      v-else-if="tableEntries.length > 0"
      :key="tableKey"
      class="flex-1 max-h-[calc(100vh-200px)]"
      :data="tableEntries"
      sticky
      v-model:globalFilter="globalFilter"
      :ui="stripedTheme"
      :columns="columns"
      :loading="accountEntriesStatus === 'pending'"
      loading-color="primary"
      loading-animation="carousel"
      @scroll="handleScroll")

    // div(v-if="isLoadingMore" class="flex justify-center items-center py-4")
      USpinner(size="sm" color="primary")
      span.ml-2.text-sm.text-gray-600(class="dark:text-gray-400") Loading more entries...

    // div(v-if="!hasMoreData && tableEntries.length > 0" class="flex justify-center items-center py-4 text-sm text-gray-500 dark:text-gray-400")
      span No more entries to load

    //- Tabs
    ul.flex.space-x-2(class="-mt-1 ml-5 mb-5")
      //- Future Tab
      li
        button(:class="isSelectedTab('future')" @click="selectedTab = 'future'") Future
      //- History Tab
      li
        button(:class="isSelectedTab('past')" @click="selectedTab = 'past'") Past

</template>
