<script setup lang="ts">
import { h, resolveComponent, watch } from "vue";
import {
  formatAccountRegisters,
  formatDate,
  isCryptoAccountType,
} from "~/lib/utils";
import {
  buildSortedCategorySelectItems,
  categoryDropdownLabel,
  sortCategoriesForManageList,
} from "~/lib/categorySelect";
import { calculateAdjustedBalance } from "~/lib/calculateAdjustedBalance";
import {
  CATEGORY_FILTER_ALL,
  CATEGORY_FILTER_UNCATEGORIZED,
  entryMatchesCategoryFilter,
} from "~/lib/categoryFilter";
import { matchesTableGlobalFilter } from "~/lib/tableGlobalFilterMatch";
import type { TableColumn } from "@nuxt/ui";
import type {
  AccountRegister,
  RegisterEntry,
  Reoccurrence,
} from "~/types/types";
import type { ModalRegisterEntryProps } from "~/components/modals/EditRegisterEntry.vue";
import type { ModalReoccurrenceProps } from "~/components/modals/EditReoccurrence.vue";
import type { MatchRegisterEntryReoccurrenceProps } from "~/components/modals/MatchRegisterEntryReoccurrence.vue";
import { useAppFetch } from "~/composables/useAppFetch";
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
const BaseIconBtn = resolveComponent("BaseIconButton");

const overlay = useOverlay();
const route = useRoute();
const toast = useToast();
const { workflowMode, defaultRegisterTab } = useWorkflowMode();
/** `defaultRegisterTab`: future/past API direction from header workflow. */
const { todayISOString } = useToday();

definePageMeta({
  path: "/register/:id?",

  middleware: "auth",
});
useHead({ title: "Register | Dineros" });

const listStore = useListStore();
const authStore = useAuthStore();
const appFetch = useAppFetch();
const snapshotMode = useSnapshotMode();
const {
  isSnapshotMode,
  activeSnapshotCreatedAt,
  selectedSnapshotValue,
  snapshotViewItems,
  exitSnapshotView,
} = snapshotMode;
const { selectedSnapshotLabel, snapshotMenuItems } = useSnapshotMenuItems({
  selectedSnapshotValue,
  snapshotViewItems,
});

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
  if (import.meta.client) globalThis.print();
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
    const pockets = r.subAccountRegisterId
      ? []
      : formatted.filter((p) => p.subAccountRegisterId === r.id);
    const balanceRaw =
      pockets.length > 0
        ? calculateAdjustedBalance(r.latestBalance ?? 0, pockets)
        : Number(r.latestBalance ?? 0);
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

const hasReoccurrences = computed(
  () => listStore.getReoccurrencesForCurrentBudget.length > 0,
);

const plaidLinked = computed(() => authStore.hasPlaidConnected);

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
    : Number.parseInt(String(route.params.id), 10),
);

watch(
  () => route.params.id,
  (id) => {
    if (id === "" || Array.isArray(id)) return;
    const n = Number.parseInt(String(id), 10);
    if (!Number.isNaN(n) && n > 0 && n !== accountRegisterId.value) {
      accountRegisterId.value = n;
    }
  },
);

watch(accountRegisterId, async (newId) => {
  if (!newId) return;
  const current = route.params.id;
  const cur =
    current === "" || Array.isArray(current)
      ? 0
      : Number.parseInt(String(current), 10);
  if (newId === cur) return;
  await navigateTo(`/register/${newId}`);
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
/** Bumped when the register list is reset (account/tab change or refresh) so in-flight load-more does not append stale slices. */
const registerLoadGeneration = ref(0);

function bumpRegisterLoadGeneration() {
  registerLoadGeneration.value += 1;
}

/** Debit-only: credit ledgers clamp each row balance with `min(balance, 0)` on the server, so displayed balances may not satisfy `prev + amount`. */
function registerEntryChainsFromLast(
  last: RegisterEntry | undefined,
  next: RegisterEntry | undefined,
): boolean {
  if (last == null || next == null) return true;
  const expected = Number(last.balance) + Number(next.amount);
  const actual = Number(next.balance);
  return (
    Number.isFinite(expected) &&
    Number.isFinite(actual) &&
    Math.abs(expected - actual) <= 0.011
  );
}

const accountEntries = shallowRef<{
  entries: RegisterEntry[];
  lowest: RegisterEntry;
  highest: RegisterEntry;
  isPartialLoad?: boolean;
}>({ entries: [], lowest: {} as RegisterEntry, highest: {} as RegisterEntry });

const isRefreshLoading = ref(false);

const tableEntries = ref<RegisterEntry[]>([]);
const tableKey = ref(0); // Force table re-render

type RegisterPagePayload = {
  entries: RegisterEntry[];
  lowest: RegisterEntry;
  highest: RegisterEntry;
  isPartialLoad?: boolean;
  hasMore: boolean;
  currentSkip: number;
};

async function fetchRegisterPagePayload(): Promise<RegisterPagePayload | null> {
  const id = accountRegisterId.value;
  if (!id || Number.isNaN(id)) {
    return {
      entries: [],
      lowest: {} as RegisterEntry,
      highest: {} as RegisterEntry,
      hasMore: false,
      currentSkip: 0,
    };
  }

  if (snapshotMode.isSnapshotMode.value) {
    const rsid =
      snapshotMode.registerSnapshotIdByRegisterId.value[id];
    if (!rsid) {
      return {
        entries: [],
        lowest: {} as RegisterEntry,
        highest: {} as RegisterEntry,
        hasMore: false,
        currentSkip: 0,
      };
    }
    try {
      const data = await appFetch<{
        entries: RegisterEntry[];
        lowest?: RegisterEntry;
        highest?: RegisterEntry;
      }>(`/api/snapshot-register/${rsid}`);
      if (!data) {
        return {
          entries: [],
          lowest: {} as RegisterEntry,
          highest: {} as RegisterEntry,
          hasMore: false,
          currentSkip: 0,
        };
      }
      const entries = [...(data.entries || [])];
      return {
        entries,
        lowest: data.lowest ?? ({} as RegisterEntry),
        highest: data.highest ?? ({} as RegisterEntry),
        hasMore: false,
        currentSkip: entries.length,
      };
    } catch (error) {
      console.error("Initial load failed:", error);
      return {
        entries: [],
        lowest: {} as RegisterEntry,
        highest: {} as RegisterEntry,
        hasMore: false,
        currentSkip: 0,
      };
    }
  }

  const reg = registersForRegisterPage.value.find((r) => r.id === id);
  if (!reg?.accountId) {
    return null;
  }

  const regType = listStore.getAccountTypes.find((t) => t.id === reg.typeId);
  if (regType?.registerClass === "crypto") {
    return {
      entries: [],
      lowest: {} as RegisterEntry,
      highest: {} as RegisterEntry,
      hasMore: false,
      currentSkip: 0,
    };
  }

  try {
    const data = await appFetch<{
      entries: RegisterEntry[];
      lowest: RegisterEntry;
      highest: RegisterEntry;
      isPartialLoad: boolean;
      hasMore: boolean;
    }>("/api/register", {
      query: {
        accountId: reg.accountId,
        accountRegisterId: id,
        direction: defaultRegisterTab.value,
        loadMode: "full",
        skip: 0,
        take: pageSize,
      },
    });

    if (!data) return null;

    const entries = [...(data.entries || [])];
    return {
      entries,
      lowest: data.lowest,
      highest: data.highest,
      isPartialLoad: data.isPartialLoad,
      hasMore: data.hasMore || false,
      currentSkip: entries.length,
    };
  } catch (error) {
    console.error("Initial load failed:", error);
    return null;
  }
}

const registerInitialDataKey = computed(() => {
  const rid = accountRegisterId.value;
  const reg = registersForRegisterPage.value.find((r) => r.id === rid);
  const snapId = snapshotMode.isSnapshotMode.value
    ? snapshotMode.registerSnapshotIdByRegisterId.value[rid] ?? 0
    : 0;
  const regTypeClass =
    reg == null
      ? ""
      : (listStore.getAccountTypes.find((t) => t.id === reg.typeId)
          ?.registerClass ?? "");
  return [
    "register-initial",
    authStore.getBudgetId,
    rid,
    defaultRegisterTab.value,
    snapshotMode.isSnapshotMode.value ? "snap" : "live",
    snapId,
    reg?.accountId ?? 0,
    regTypeClass,
  ].join(":");
});

const {
  data: registerPageData,
  pending: registerPagePending,
  refresh: refreshRegisterPageData,
} = await useAsyncData(
  () => registerInitialDataKey.value,
  fetchRegisterPagePayload,
  { watch: [registerInitialDataKey] },
);

async function loadMoreChainAllowsAppend(
  lastLoaded: RegisterEntry | undefined,
  firstNew: RegisterEntry | undefined,
): Promise<boolean> {
  const regForAppend = registersForRegisterPage.value.find(
    (r) => r.id === accountRegisterId.value,
  );
  const tid = regForAppend?.typeId;
  const typeForAppend =
    tid == null
      ? undefined
      : listStore.getAccountTypes.find((t) => t.id === tid);
  if (typeForAppend?.isCredit === true) return true;
  if (registerEntryChainsFromLast(lastLoaded, firstNew)) return true;
  bumpRegisterLoadGeneration();
  await refreshRegisterPageData();
  return false;
}

function applyRegisterLoadMoreAppend(data: {
  entries: RegisterEntry[];
  hasMore: boolean;
  lowest: RegisterEntry;
  highest: RegisterEntry;
}) {
  tableEntries.value = [...tableEntries.value, ...data.entries];
  hasMoreData.value = data.hasMore || false;
  currentSkip.value += data.entries.length;
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
}

function applyRegisterPageData(payload: RegisterPagePayload | null) {
  if (payload == null) return;
  accountEntries.value = {
    entries: [...payload.entries],
    lowest: payload.lowest,
    highest: payload.highest,
    isPartialLoad: payload.isPartialLoad,
  };
  tableEntries.value = [...payload.entries];
  hasMoreData.value = payload.hasMore;
  currentSkip.value = payload.currentSkip;
  tableKey.value++;
}

watch(registerPageData, (payload) => applyRegisterPageData(payload), {
  immediate: true,
});

watch(registerInitialDataKey, (_key, oldKey) => {
  if (oldKey === undefined) return;
  bumpRegisterLoadGeneration();
  currentSkip.value = 0;
  hasMoreData.value = true;
  tableEntries.value = [];
  accountEntries.value = {
    entries: [],
    lowest: {} as RegisterEntry,
    highest: {} as RegisterEntry,
  };
});

const showRegisterOnboarding = computed(() => {
  if (snapshotMode.isSnapshotMode.value) return false;
  if (isCurrentRegisterCrypto.value) return false;
  if (onboardingDismissed.value) return false;
  if (!listStore.getAccountRegisters.length) return false;
  if (registerPagePending.value) return false;
  return tableEntries.value.length === 0;
});

// Load more data for infinite scrolling
const loadMoreEntries = async () => {
  if (snapshotMode.isSnapshotMode.value) return;
  if (isCurrentRegisterCrypto.value) return;
  if (isLoadingMore.value || !hasMoreData.value) return;

  const generationAtStart = registerLoadGeneration.value;
  isLoadingMore.value = true;
  try {
    const data = await appFetch<{
      entries: RegisterEntry[];
      lowest: RegisterEntry;
      highest: RegisterEntry;
      isPartialLoad: boolean;
      hasMore: boolean;
    }>("/api/register", {
      query: {
        accountId: registersForRegisterPage.value.find(
          (r) => r.id === accountRegisterId.value,
        )?.accountId,
        accountRegisterId: accountRegisterId.value,
        direction: defaultRegisterTab.value,
        loadMode: "full",
        skip: currentSkip.value,
        take: pageSize,
      },
    });

    if (generationAtStart !== registerLoadGeneration.value) {
      return;
    }

    if (data?.entries?.length > 0) {
      const lastLoaded = tableEntries.value[tableEntries.value.length - 1];
      const firstNew = data.entries[0];
      const chainOk = await loadMoreChainAllowsAppend(lastLoaded, firstNew);
      if (chainOk) {
        applyRegisterLoadMoreAppend(data);
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

/** Load more when the window is scrolled most of the way through the document. */
function handleWindowScrollForInfiniteLoad() {
  if (!import.meta.client) return;
  const doc = document.documentElement;
  const scrollTop = window.scrollY ?? doc.scrollTop;
  const scrollHeight = doc.scrollHeight;
  const clientHeight = window.innerHeight;
  if (
    scrollTop + clientHeight >= scrollHeight * 0.8 &&
    hasMoreData.value &&
    !isLoadingMore.value
  ) {
    void loadMoreEntries();
  }
}

watch([() => tableEntries.value.length, hasMoreData], () => {
  if (!import.meta.client) return;
  void nextTick(() => handleWindowScrollForInfiniteLoad());
});

const refreshAccountEntries = async () => {
  bumpRegisterLoadGeneration();
  isRefreshLoading.value = true;
  try {
    await refreshRegisterPageData();
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
      amountAdjustmentMode: "NONE",
      amountAdjustmentIntervalCount: 1,
    },
    callback: async (created: Reoccurrence) => {
      listStore.patchReoccurrence(created);
      listStore.fetchLists();
      try {
        await appFetch("/api/register-entry", {
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

const accountEntriesStatus = computed(() => {
  if (registerPagePending.value) return "pending";
  if (tableEntries.value.length > 0) return "success";
  return "idle";
});

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

const isCurrentRegisterCrypto = computed(() => {
  const reg = currentAccountRegister.value;
  if (!reg) return false;
  return isCryptoAccountType(reg.typeId, listStore.getAccountTypes);
});

type CryptoPortfolioResponse = {
  accountRegisterId: number;
  alchemyLastSyncAt: string | null;
  totalUsd: number;
  tokens: Array<{
    id: number;
    network: string;
    tokenName: string;
    tokenSymbol: string;
    displayBalance: number;
    priceUsd: number | null;
    valueUsd: number | null;
    logoUrl: string | null;
    syncedAt: string;
  }>;
};

const cryptoPortfolio = ref<CryptoPortfolioResponse | null>(null);
const cryptoPortfolioPending = ref(false);
const cryptoSyncLoading = ref(false);

async function loadCryptoPortfolio() {
  if (!isCurrentRegisterCrypto.value || snapshotMode.isSnapshotMode.value) {
    cryptoPortfolio.value = null;
    return;
  }
  const id = accountRegisterId.value;
  if (!id) return;
  cryptoPortfolioPending.value = true;
  try {
    cryptoPortfolio.value = await appFetch<CryptoPortfolioResponse>(
      `/api/crypto-tokens/${id}`,
    );
  } catch {
    toast.add({
      color: "error",
      description: "Failed to load on-chain portfolio.",
    });
  } finally {
    cryptoPortfolioPending.value = false;
  }
}

async function syncCryptoPortfolio() {
  const id = accountRegisterId.value;
  if (!id || !isCurrentRegisterCrypto.value) return;
  cryptoSyncLoading.value = true;
  try {
    await appFetch("/api/crypto-sync", {
      method: "POST",
      body: { accountRegisterId: id },
    });
    await listStore.fetchLists();
    await loadCryptoPortfolio();
    toast.add({ color: "success", description: "Wallet synced." });
  } catch {
    toast.add({
      color: "error",
      description: "Sync failed. Check ALCHEMY_API_KEY and try again.",
    });
  } finally {
    cryptoSyncLoading.value = false;
  }
}

watch(
  [accountRegisterId, isCurrentRegisterCrypto, () => snapshotMode.isSnapshotMode.value],
  () => {
    void loadCryptoPortfolio();
  },
  { immediate: true },
);

const isLoading = computed(
  () => registerPagePending.value || isRefreshLoading.value,
);

onMounted(() => {
  if (import.meta.client) {
    window.addEventListener("scroll", handleWindowScrollForInfiniteLoad, {
      passive: true,
    });
  }
});

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener("scroll", handleWindowScrollForInfiniteLoad);
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
            role: "button",
            tabindex: 0,
            onClick: () => handleTableClick(entry),
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleTableClick(entry);
              }
            },
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
                    h(BaseIconBtn, {
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
                    h(BaseIconBtn, {
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
        Number(row.getValue("amount")) < 0
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
        Number(row.getValue("balance")) < 0
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
/** Incremented on each edit modal open; stale success paths must not close a newer session. */
const registerEditModalSession = ref(0);
const modal = overlay.create(ModalsEditRegisterEntry);

function handleTableClick(data: RegisterEntry) {
  if (snapshotMode.isSnapshotMode.value) return;
  const session = ++registerEditModalSession.value;
  const editRegistryEntryProps: ModalRegisterEntryProps = {
    title: `Edit Entry`,
    description: "",
    callback: async () => {
      await refreshAccountEntries();
      if (session === registerEditModalSession.value) {
        modal.close();
      }
    },
    cancel: () => {
      if (session === registerEditModalSession.value) {
        modal.close();
      }
    },
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
    const tableElement = tableRef.value;
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

const globalFilter = useSharedTableGlobalFilter();
const categoryFilter = ref(CATEGORY_FILTER_ALL);
/** Pick category id from `USelectMenu` model (string or item object). */
function registerCategoryFilterKey(raw: unknown): string {
  if (raw == null || raw === "") return CATEGORY_FILTER_ALL;
  if (typeof raw === "string") return raw;
  if (typeof raw !== "object" || raw === null) {
    const s = String(raw);
    return s === "[object Object]" ? CATEGORY_FILTER_ALL : s;
  }
  const o = raw as Record<string, unknown>;
  for (const k of ["value", "id"] as const) {
    if (!(k in o)) continue;
    const inner = o[k];
    if (inner == null || inner === "") continue;
    return typeof inner === "string" ? inner : String(inner);
  }
  return CATEGORY_FILTER_ALL;
}
const tableRef = ref<HTMLElement | null>(null);
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
  tableEntries.value.filter((e) => {
    const matchesCategory = entryMatchesCategoryFilter(
      e.categoryId,
      registerCategoryFilterKey(categoryFilter.value),
      listStore.getCategories,
    );
    if (!matchesCategory) return false;

    const categoryName =
      e.categoryId == null
        ? "uncategorized"
        : (listStore.getCategories.find((c) => c.id === e.categoryId)?.name ??
          "");
    const dateText = formatDate(e.createdAt) ?? "";

    return matchesTableGlobalFilter(globalFilter.value, [
      e.description ?? "",
      categoryName,
      dateText,
      String(e.amount ?? ""),
      String(e.balance ?? ""),
    ]);
  }),
);

/** Running balance per row always matches the API (`entry.balance`). Forward-chaining only visible amounts was wrong when hidden rows fall between consecutive visible rows (e.g. category/search filters). */
const registerRowsForDisplay = computed(() =>
  registerRowsForTable.value.map((entry) => ({
    entry,
    displayBalance: Number(entry.balance),
  })),
);

const needsFullRegisterHydration = computed(() => {
  if (snapshotMode.isSnapshotMode.value) return false;
  if (isCurrentRegisterCrypto.value) return false;
  if (globalFilter.value.trim().length > 0) return true;
  return (
    registerCategoryFilterKey(categoryFilter.value) !== CATEGORY_FILTER_ALL
  );
});

const isRegisterFilterHydrating = ref(false);

const showRegisterFilterHydrationBanner = computed(
  () =>
    needsFullRegisterHydration.value &&
    hasMoreData.value &&
    (isRegisterFilterHydrating.value || isLoadingMore.value) &&
    tableEntries.value.length > 0 &&
    registerRowsForDisplay.value.length > 0,
);

const registerFilterEmptyAlert = computed(() => {
  const searching =
    needsFullRegisterHydration.value &&
    hasMoreData.value &&
    (isRegisterFilterHydrating.value || isLoadingMore.value);
  if (searching) {
    return {
      title: "Searching the full register…",
      description:
        "Loading more entries in batches. Matching rows will appear as they are found.",
    };
  }
  const hasText = globalFilter.value.trim().length > 0;
  const hasCat =
    registerCategoryFilterKey(categoryFilter.value) !== CATEGORY_FILTER_ALL;
  if (hasText && hasCat) {
    return {
      title: "No rows match these filters",
      description:
        "Try different search text, choose All categories, or clear filters (⎋).",
    };
  }
  if (hasText) {
    return {
      title: "No rows match your search",
      description:
        "Try another term or clear the filter (⎋). The full register was searched.",
    };
  }
  return {
    title: "No rows match this category filter",
    description:
      "Choose All categories, Uncategorized, or another category.",
  };
});

let registerFilterHydrationDebounce: ReturnType<typeof setTimeout> | null =
  null;
const REGISTER_FILTER_HYDRATION_DEBOUNCE_MS = 320;

async function drainRegisterPagesWhileFiltering(genAtStart: number) {
  let consecutiveNoProgress = 0;
  while (
    needsFullRegisterHydration.value &&
    hasMoreData.value &&
    genAtStart === registerLoadGeneration.value
  ) {
    const lenBefore = tableEntries.value.length;
    await loadMoreEntries();
    if (genAtStart !== registerLoadGeneration.value) break;
    const lenAfter = tableEntries.value.length;
    if (lenAfter > lenBefore) {
      consecutiveNoProgress = 0;
    } else if (hasMoreData.value) {
      consecutiveNoProgress += 1;
      if (consecutiveNoProgress >= 3) break;
    }
  }
}

async function hydrateRegisterForActiveFilters() {
  if (!import.meta.client) return;
  if (!needsFullRegisterHydration.value) return;
  if (snapshotMode.isSnapshotMode.value) return;
  if (isCurrentRegisterCrypto.value) return;
  const id = accountRegisterId.value;
  if (!id || Number.isNaN(id)) return;
  if (registerPagePending.value) return;

  const genAtStart = registerLoadGeneration.value;
  isRegisterFilterHydrating.value = true;
  try {
    await drainRegisterPagesWhileFiltering(genAtStart);
  } finally {
    isRegisterFilterHydrating.value = false;
  }
}

function scheduleRegisterFilterHydration() {
  if (!import.meta.client) return;
  if (registerFilterHydrationDebounce) {
    clearTimeout(registerFilterHydrationDebounce);
  }
  registerFilterHydrationDebounce = setTimeout(() => {
    registerFilterHydrationDebounce = null;
    void hydrateRegisterForActiveFilters();
  }, REGISTER_FILTER_HYDRATION_DEBOUNCE_MS);
}

watch(
  () => [
    globalFilter.value,
    registerCategoryFilterKey(categoryFilter.value),
    needsFullRegisterHydration.value,
    accountRegisterId.value,
    defaultRegisterTab.value,
    registerPagePending.value,
    tableEntries.value.length,
  ],
  () => {
    scheduleRegisterFilterHydration();
  },
);

onBeforeUnmount(() => {
  if (registerFilterHydrationDebounce) {
    clearTimeout(registerFilterHydrationDebounce);
    registerFilterHydrationDebounce = null;
  }
});

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
    combinedTableFilterRef.value?.expandAndFocus()?.catch(() => {});
  },
  meta_shift_r: () => recalcAccount(),
});

const isRecalcAccountLoading = ref(false);
const showShortcuts = ref(false);
const recalcLiveMessage = ref("");
async function recalcAccount() {
  if (snapshotMode.isSnapshotMode.value) return;
  if (workflowMode.value === "reconciliation") return;
  if (isRecalcAccountLoading.value) return; // Prevent multiple simultaneous calls

  isRecalcAccountLoading.value = true;
  try {
    const data = await appFetch<{
      success: boolean;
      entriesCalculated: number;
      entriesBalance: number;
      accountRegisters: number;
    }>("/api/recalculate", {
      method: "POST",
      body: {
        accountId: currentAccountRegister.value?.accountId,
        ...(authStore.budgetId > 0 ? { budgetId: authStore.budgetId } : {}),
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
  section.mx-2(class="min-w-0")
    h1(class="sr-only") Register
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
    UAlert(
      v-else-if="workflowMode === 'forecasting'"
      color="primary"
      variant="subtle"
      class="mt-4"
      title="Forecasting"
    )
      template(#description)
        span.frog-text-muted Projected entries and balances — use Recalc to refresh the forecast. Choose Reconcile in the header for cleared history and statement periods.
    UAlert(
      v-else
      color="neutral"
      variant="subtle"
      class="mt-4"
      title="Reconciliation"
    )
      template(#description)
        .flex.flex-wrap.gap-2.items-center
          span.frog-text-muted This view shows cleared and reconciled activity. Open the workspace to match your bank statement.
          UButton(
            size="xs"
            variant="soft"
            icon="i-lucide-calculator"
            :to="`/reconciliation/${accountRegisterId}`") Reconciliation workspace
    //- Account picker when there is no table yet (toolbar lives in thead once rows load)
    .flex(
      v-if="showAccountSelector && tableEntries.length === 0"
      class="mt-4 flex-wrap gap-2 items-center justify-end")
      div(class="basis-full md:basis-auto shrink min-w-0 flex flex-col items-end gap-1")
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
                span(class="inline-flex items-center gap-2 min-w-0 max-w-full text-default")
                  template(v-if="selectedAccountOption")
                    span(class="truncate min-w-0") {{ selectedAccountOption.label }}
                    span(:class="[balanceColorClass(selectedAccountOption.balanceRaw), 'tabular-nums shrink-0']") {{ selectedAccountOption.balanceFormatted }}
                  span(v-else) …
              template(#item-trailing="{ item }")
                span(:class="['tabular-nums text-right shrink-0', balanceColorClass(item.balanceRaw)]") {{ item.balanceFormatted }}
            template(#fallback)
              span(class="inline-flex items-center gap-2 min-w-0 w-full md:w-64 my-0 text-sm text-default")
                template(v-if="selectedAccountOption")
                  span(class="truncate min-w-0") {{ selectedAccountOption.label }}
                  span(:class="[balanceColorClass(selectedAccountOption.balanceRaw), 'tabular-nums shrink-0']") {{ selectedAccountOption.balanceFormatted }}
                span(v-else) …
        div(class="text-muted text-right" v-if="lowestEntry && !currentType?.isCredit && lowestEntry.accountRegisterId === accountRegisterId")
          span The lowest balance of&nbsp;
          b(@click="scrollToLowestBalance" class="cursor-pointer frog-link")
            DollarFormat(:amount="lowestEntry.balance")
            | &nbsp;
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
        li(v-if="workflowMode === 'forecasting'") Recalculate forecast: ⌘ + Shift + R

    UCard(v-if="listStore.getAccountRegisters.length === 0" class="my-4")
      template(#header)
        h3(class="font-semibold") No accounts yet
      p(class="frog-text-muted mb-4") Create your first account register before adding transactions and forecasts.
      UButton(to="/account-registers" color="primary" size="sm") Add account

    div(
      v-else-if="showRegisterOnboarding"
      class="w-full flex justify-center py-2 px-1")
      div(class="w-full max-w-lg")
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

    //- Skeleton loading state (shell matches loaded register-table-outer + merged thead)
    template(v-else-if="isLoading && tableEntries.length === 0 && !isCurrentRegisterCrypto")
      div(class="register-table-outer mt-2 min-w-0 w-full rounded-md border border-primary/40")
        div(class="flex flex-col min-h-0")
          div(class="flex gap-2 border-b border-default px-2 py-2 items-center flex-wrap xl:flex-nowrap")
            div(class="min-w-0 flex-1 flex items-center gap-2")
              USkeleton(class="h-9 grow min-w-32 sm:max-w-48 rounded-md")
              USkeleton(class="h-9 w-9 rounded-md shrink-0")
              USkeleton(class="h-9 w-9 rounded-md shrink-0")
              USkeleton(class="h-9 w-9 rounded-md shrink-0")
              USkeleton(class="h-9 w-9 rounded-md shrink-0")
              USkeleton(class="h-9 w-9 rounded-md shrink-0")
            div(class="basis-full xl:basis-auto xl:ml-auto shrink min-w-0 flex flex-col items-end gap-2")
              div(class="flex items-center gap-2")
                USkeleton(class="h-4 w-28")
                USkeleton(class="h-7 w-36 rounded-md")
              USkeleton(class="h-4 w-56")
          div(
            class="register-inner-head-grid w-full border-t border-default bg-default text-xs sm:text-sm font-semibold text-default"
          )
            div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0")
              USkeleton(class="h-4 w-2 mx-auto")
            div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default")
              USkeleton(class="h-4 w-14 ml-auto")
            div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0")
              USkeleton(class="h-4 w-20")
            div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0 hidden md:block")
              USkeleton(class="h-4 w-16")
            div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default")
              USkeleton(class="h-4 w-14 ml-auto")
            div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default")
              USkeleton(class="h-4 w-14 ml-auto")
          div(
            v-for="i in 25"
            :key="`reg-skel-${i}`"
            class="register-inner-head-grid w-full border-b border-default odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700"
          )
            div(class="p-2 sm:p-4 min-w-0 flex justify-center")
              USkeleton(class="h-4 w-2")
            div(class="p-2 sm:p-4 min-w-0 flex justify-end")
              USkeleton(class="h-4 w-20")
            div(class="p-2 sm:p-4 min-w-0")
              USkeleton(class="h-4 max-w-full")
            div(class="p-2 sm:p-4 min-w-0 hidden md:flex md:items-center")
              USkeleton(class="h-4 w-24")
            div(class="p-2 sm:p-4 min-w-0 flex justify-end")
              USkeleton(class="h-4 w-16")
            div(class="p-2 sm:p-4 min-w-0 flex justify-end")
              USkeleton(class="h-4 w-20")

    div(v-else-if="isCurrentRegisterCrypto && !isSnapshotMode" class="mt-4 min-w-0 w-full")
      UCard
        template(#header)
          div(class="flex flex-wrap gap-2 items-center justify-between w-full")
            div
              h3(class="font-semibold") On-chain portfolio
              p(v-if="cryptoPortfolio?.alchemyLastSyncAt" class="text-xs frog-text-muted mt-1")
                span Last synced {{ formatDate(cryptoPortfolio.alchemyLastSyncAt) }}
            UButton(
              size="sm"
              color="primary"
              :loading="cryptoSyncLoading"
              @click="syncCryptoPortfolio") Sync wallet
        USkeleton(v-if="cryptoPortfolioPending" class="h-32 w-full rounded-md")
        div(v-else class="space-y-3")
          div(class="flex justify-between items-baseline gap-2 border-b border-default pb-3")
            span(class="text-sm frog-text-muted") Total (USD)
            span(class="text-xl font-semibold tabular-nums") {{ formatMoneyUsd(cryptoPortfolio?.totalUsd ?? currentAccountRegister?.latestBalance ?? 0) }}
          div(v-if="!(cryptoPortfolio?.tokens?.length)" class="text-sm frog-text-muted py-4 text-center") No token balances yet — tap Sync wallet.

          table(v-else class="w-full text-sm border-collapse")
            thead
              tr(class="border-b border-default text-left text-muted")
                th(class="py-2 pr-2") Asset
                th(class="py-2 pr-2 hidden sm:table-cell") Network
                th(class="py-2 text-right") Balance
                th(class="py-2 text-right") Value (USD)
            tbody
              tr(
                v-for="t in cryptoPortfolio.tokens"
                :key="t.id"
                class="border-b border-default odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700"
              )
                td(class="py-2 pr-2 min-w-0")
                  div(class="flex items-center gap-2 min-w-0")
                    img(
                      v-if="t.logoUrl"
                      :src="t.logoUrl"
                      :alt="t.tokenSymbol"
                      class="size-7 rounded-full shrink-0"
                      loading="lazy"
                    )
                    div(class="min-w-0")
                      div(class="font-medium truncate") {{ t.tokenName }}
                      div(class="text-xs text-muted") {{ t.tokenSymbol }}
                td(class="py-2 pr-2 hidden sm:table-cell text-muted whitespace-nowrap") {{ t.network }}
                td(class="py-2 text-right tabular-nums whitespace-nowrap") {{ t.displayBalance }}
                td(class="py-2 text-right tabular-nums whitespace-nowrap") {{ t.valueUsd != null ? formatMoneyUsd(t.valueUsd) : "—" }}

    div(v-else-if="tableEntries.length > 0 && !isCurrentRegisterCrypto" class="register-table-outer mt-2 min-w-0 w-full rounded-md border border-primary/40")
      table(
        ref="tableRef"
        :key="tableKey"
        aria-label="Register entries"
        class="register-main-table w-full min-w-full table-fixed border-separate border-spacing-0 text-xs sm:text-sm")
        colgroup
          col(style="width:3%")
          col(style="width:11%")
          col(style="width:36%")
          col.register-col-category(style="width:17%")
          col(style="width:14%")
          col(style="width:19%")
        thead.register-sticky-thead
          tr
            th(
              colspan="6"
              scope="colgroup"
              class="register-table-controls-th register-thead-sticky-th sticky top-(--ui-header-height) z-38 overflow-hidden rounded-t-md border-b border-default bg-default/95 backdrop-blur-md supports-backdrop-filter:bg-default/90 p-0 align-top font-normal")
              div.register-sticky-head
                  div(class="flex flex-col min-h-0")
                    div(class="flex gap-2 border-b border-default px-2 py-2 items-center flex-wrap xl:flex-nowrap")
                      div(class="min-w-0 flex-1 flex items-center gap-2")
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
                            FiltersCombinedGlobalCategoryFilter(
                              ref="combinedTableFilterRef"
                              v-model:global-filter="globalFilter"
                              v-model:category-filter="categoryFilter"
                              :category-items="categoryFilterSelectItems"
                              filter-input-id="register-table-filter"
                              input-class="min-w-[8rem] sm:max-w-48 lg:max-w-48 grow"
                            )
                          template(#middle)
                            UDropdownMenu(:items="snapshotMenuItems")
                              UTooltip(:text="`Snapshot view: ${selectedSnapshotLabel}`" :delay-duration="150")
                                BaseIconButton(
                                  icon="i-lucide-camera"
                                  :active="!!isSnapshotMode"
                                  :title="`Snapshot view: ${selectedSnapshotLabel}`"
                                  :aria-label="`Snapshot view: ${selectedSnapshotLabel}`"
                                )
                            UTooltip(v-if="!isSnapshotMode && workflowMode === 'forecasting'" text="Recalculate forecast" :delay-duration="150")
                              BaseIconButton(
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
                                span(class="inline-flex items-center gap-2 min-w-0 max-w-full text-default")
                                  template(v-if="selectedAccountOption")
                                    span(class="truncate min-w-0") {{ selectedAccountOption.label }}
                                    span(:class="[balanceColorClass(selectedAccountOption.balanceRaw), 'tabular-nums shrink-0']") {{ selectedAccountOption.balanceFormatted }}
                                  span(v-else) …
                              template(#item-trailing="{ item }")
                                span(:class="['tabular-nums text-right shrink-0', balanceColorClass(item.balanceRaw)]") {{ item.balanceFormatted }}
                            template(#fallback)
                              span(class="inline-flex items-center gap-2 min-w-0 w-full md:w-64 my-0 text-sm text-default")
                                template(v-if="selectedAccountOption")
                                  span(class="truncate min-w-0") {{ selectedAccountOption.label }}
                                  span(:class="[balanceColorClass(selectedAccountOption.balanceRaw), 'tabular-nums shrink-0']") {{ selectedAccountOption.balanceFormatted }}
                                span(v-else) …
                        div(class="text-muted text-right" v-if="lowestEntry && !currentType?.isCredit && lowestEntry.accountRegisterId === accountRegisterId")
                          span The lowest balance of&nbsp;
                          b(@click="scrollToLowestBalance" class="cursor-pointer frog-link")
                            DollarFormat(:amount="lowestEntry.balance")
                            | &nbsp;
                          span &nbsp;on
                          b.text-nowrap &nbsp;{{ formatDate(lowestEntry.createdAt) }}&nbsp;
                        div(class="text-muted text-right" v-else-if="highestEntry && currentType?.isCredit && highestEntry.accountRegisterId === accountRegisterId")
                          span The loan will be paid off on
                          b.text-nowrap &nbsp;{{ formatDate(highestEntry.createdAt) }}&nbsp;
                    div.register-inner-head-grid(
                      class="w-full border-t border-default bg-default text-xs sm:text-sm font-semibold text-default")
                      div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-left border-b border-default min-w-0")
                        span(class="sr-only") Import review
                      div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right whitespace-nowrap border-b border-default") Date
                      div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-left border-b border-default min-w-0") Description
                      div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-left whitespace-nowrap border-b border-default min-w-0 hidden md:block") Category
                      div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right whitespace-nowrap border-b border-default") Amount
                      div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right whitespace-nowrap border-b border-default") Balance
        tbody
          template(v-if="registerRowsForDisplay.length === 0")
            tr
              td(colspan="6" class="p-2 sm:p-4 align-top")
                UAlert(
                  color="neutral"
                  variant="subtle"
                  :title="registerFilterEmptyAlert.title"
                  :description="registerFilterEmptyAlert.description")
          template(v-else)
            tr(
              v-for="({ entry, displayBalance }, index) in registerRowsForDisplay"
              :key="entry.id ?? `reg-entry-${index}-${entry.createdAt}`"
              :class="`odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700`")
              td(class="p-2 sm:p-4 border-b border-default w-7")
                .flex.justify-center.w-7
                  UTooltip(
                    v-if="isPlaidImportAwaitingReview(entry)"
                    text="Bank import not reviewed yet. Clear, reconcile, or match to a recurrence using the row actions."
                    :delay-duration="200")
                    span(class="inline-flex cursor-default items-center justify-center p-1.5 -m-1 rounded-sm")
                      span(
                        class="inline-block size-2 rounded-full bg-amber-500 dark:bg-amber-400 ring-2 ring-amber-500/25 dark:ring-amber-400/30 shrink-0"
                        role="img"
                        aria-label="Bank import not reviewed yet.")
                  span(v-else class="inline-block size-2 shrink-0")
              td(class="p-2 sm:p-4 border-b border-default text-right tabular-nums whitespace-nowrap") {{ formatDate(entry.createdAt) }}
              td(class="p-2 sm:p-4 border-b border-default")
                .flex.items-center.gap-1.min-w-0
                  div(
                    class="cursor-pointer font-bold dark:text-white truncate flex-1 min-w-0"
                    role="button"
                    tabindex="0"
                    @click="handleTableClick(entry)"
                    @keydown.enter.prevent="handleTableClick(entry)"
                    @keydown.space.prevent="handleTableClick(entry)") {{ entry.description }}
                  template(v-if="isPlaidImportAwaitingReview(entry)")
                    UTooltip(
                      text="Create a recurring rule from this import and link this row to it."
                      :delay-duration="200")
                      BaseIconButton(
                        size="xs"
                        icon="i-lucide-repeat"
                        class="shrink-0"
                        aria-label="Create recurrence from this import and link this transaction"
                        @click.stop="openReoccurrenceFromPlaidEntry(entry)")
                    UTooltip(
                      text="Match to an existing recurrence and remember this bank name for the next Plaid sync."
                      :delay-duration="200")
                      BaseIconButton(
                        size="xs"
                        icon="i-lucide-link"
                        class="shrink-0"
                        aria-label="Match to existing recurrence and save name alias for future syncs"
                        @click.stop="openMatchToRecurrence(entry)")
              td.register-cell-category(class="p-2 sm:p-4 border-b border-default text-muted whitespace-nowrap")
                | {{ entry.categoryId == null ? "—" : (listStore.getCategories.find((c) => c.id === entry.categoryId)?.name ?? "—") }}
              td(class="p-2 sm:p-4 border-b border-default text-right whitespace-nowrap")
                DollarFormat(:amount="Number(entry.amount)")
              td(class="p-2 sm:p-4 border-b border-default text-right whitespace-nowrap")
                DollarFormat(:amount="displayBalance")
    div(
      v-if="showRegisterFilterHydrationBanner"
      class="flex justify-center items-center gap-2 py-2.5 px-2 mb-2 rounded-md border border-primary/40 bg-default/90"
    )
      USpinner(size="sm" color="primary")
      span(class="text-sm frog-text-muted") Searching the full register… Matching rows appear as each batch loads.

    div(
      v-if="workflowMode === 'reconciliation' && tableEntries.length > 0 && !isSnapshotMode"
      class="flex justify-end mb-4")
      UButton(
        size="xs"
        variant="soft"
        icon="i-lucide-calculator"
        :to="`/reconciliation/${accountRegisterId}`") Open reconciliation workspace

</template>

<style scoped>
/* Default: no overflow so sticky thead uses the viewport. On narrow screens we enable horizontal scroll here
   and pair `overflow-y: clip` so the box is not a vertical scrollport (avoids sticky/`top` gaps). */
.register-table-outer {
  padding: 0;
}

/* Table cells default to middle/baseline alignment; kills stray gap above the toolbar block. */
.register-table-controls-th {
  vertical-align: top;
  line-height: 0;
}

.register-table-controls-th .register-sticky-head {
  line-height: normal;
}

/* Sticky on `thead`/`tr` is not portable; one colspan `th` carries the whole header block. */
.register-main-table thead.register-sticky-thead .register-thead-sticky-th {
  position: sticky;
  top: var(--ui-header-height);
}

/* Bottom corners of the bordered block (top corners are on the sticky `th`). `border-separate` + spacing 0 is set on the table so radii apply — `collapse` ignores them. */
.register-main-table tbody tr:last-child td:first-child {
  border-bottom-left-radius: 0.375rem;
}

.register-main-table tbody tr:last-child td:last-child {
  border-bottom-right-radius: 0.375rem;
}

.register-main-table tbody tr:last-child td:only-child {
  border-bottom-left-radius: 0.375rem;
  border-bottom-right-radius: 0.375rem;
}

/* Column floor widths — keep text from overlapping; table may exceed 100% and scroll on narrow screens. */
.register-main-table col:nth-child(1) {
  min-width: 2.25rem;
}

.register-main-table col:nth-child(2) {
  min-width: 5.5rem;
}

.register-main-table col:nth-child(3) {
  min-width: 9rem;
}

.register-main-table col.register-col-category {
  min-width: 5.5rem;
}

.register-main-table col:nth-child(5) {
  min-width: 5rem;
}

.register-main-table col:nth-child(6) {
  min-width: 5.5rem;
}

/* Match outer <colgroup> ratios so column labels line up with body cells. */
.register-inner-head-grid {
  display: grid;
  grid-template-columns: minmax(1.75rem, 3%) minmax(4.5rem, 11%) minmax(
      0,
      1fr
    ) minmax(5rem, 17%) minmax(3.5rem, 14%) minmax(4rem, 19%);
}

/* Below `md` (768px): hide category column.
   Do not use `display:none` on `td` — it drops the cell from the table grid and breaks col/colgroup alignment
   (Amount/Balance shift under wrong headers). Use `visibility:collapse` on col + td and widen description col. */
@media (max-width: 767px) {
  .register-table-outer {
    overflow-x: auto;
    overflow-y: clip;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
  }

  /* At least full container width or 36rem — beats `min-w-full` so the table can grow and scroll inside the wrapper. */
  .register-table-outer .register-main-table {
    min-width: max(100%, 36rem);
  }

  .register-main-table col:nth-child(3) {
    min-width: 12rem;
    width: 53% !important; /* 36% + 17% when category is collapsed */
  }

  .register-main-table col.register-col-category {
    visibility: collapse;
    width: 0 !important;
    min-width: 0 !important;
  }

  .register-main-table td.register-cell-category {
    visibility: collapse;
    padding: 0 !important;
    border: none !important;
    font-size: 0;
    line-height: 0;
    overflow: hidden;
  }

  .register-inner-head-grid {
    grid-template-columns:
      minmax(2.25rem, 3%) minmax(5.5rem, 11%) minmax(12rem, 1fr) minmax(5rem, 14%)
      minmax(5.5rem, 19%);
  }
}
</style>
