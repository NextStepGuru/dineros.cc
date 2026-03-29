<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AccountRegister } from "~/types/types";
import { useListStore } from "../stores/listStore";
import { formatDate, getAccountTypeLabel } from "~/lib/utils";
import { CATEGORY_FILTER_ALL } from "~/lib/categoryFilter";
import type { ModelAccountRegisterProps } from "~/components/modals/EditAccountRegister.vue";
import {
  dispatchNotificationsRefresh,
  dismissNotification,
} from "~/lib/notifications";

type AccountRegisterSortMode = "visual" | "loan" | "savings";
type ForecastRiskAlert = {
  notificationId: number;
  key: string;
  accountRegisterId: number;
  accountRegisterName: string;
  riskType: "negative_balance" | "below_min_balance";
  threshold: number;
  projectedBalanceAtRisk: number;
  projectedLowestBalance: number;
  riskAt: string;
  daysUntilRisk: number;
};

const ModalsEditAccountRegister = defineAsyncComponent(
  () => import("~/components/modals/EditAccountRegister.vue"),
);

const ModalsManageCategories = defineAsyncComponent(
  () => import("~/components/modals/ManageCategories.vue"),
);

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Accounts | Dineros" });

const snapshotMode = useSnapshotMode();
const { workflowMode } = useWorkflowMode();
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

// Drag and drop functions (defined early to ensure availability)
function handleDragStart(event: DragEvent, index: number) {
  if (snapshotMode.isSnapshotMode.value) {
    event.preventDefault();
    return;
  }
  draggedIndex.value = index;
  isDragging.value = true;

  // Check if this parent has pocket accounts
  const parentAccount = draggableAccountRegisters.value[index];
  const pocketAccounts = listStore.getAccountRegisters.filter(
    (f) => f.subAccountRegisterId === parentAccount.id,
  );

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    // Set a custom drag image if needed
    const dragElement = event.target as HTMLElement;
    if (dragElement) {
      event.dataTransfer.setDragImage(dragElement, 0, 0);
    }
  }

  // Store pocket accounts info for group dragging
  if (pocketAccounts.length > 0) {
    draggedPocketGroup.value = {
      parentId: parentAccount.id,
      pocketAccounts: pocketAccounts,
    };
  } else {
    draggedPocketGroup.value = null;
  }
}

// Touch event handlers for mobile (long-press to drag, short tap to click)
function handleTouchStart(event: TouchEvent, index: number) {
  if (snapshotMode.isSnapshotMode.value) return;
  if (event.touches.length > 1) return;

  const touch = event.touches[0];
  touchStartTime.value = Date.now();
  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
  touchStartIndex.value = index;
  pendingTapRow.value = draggableAccountRegisters.value[index];
  pendingTapSubRow.value = null;

  if (longPressTimer.value != null) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }

  longPressTimer.value = setTimeout(() => {
    longPressTimer.value = null;
    isDragging.value = true;
    draggedIndex.value = index;
    pendingTapRow.value = null;
    pendingTapSubRow.value = null;

    const parentAccount = draggableAccountRegisters.value[index];
    const pocketAccounts = listStore.getAccountRegisters.filter(
      (f) => f.subAccountRegisterId === parentAccount.id,
    );
    if (pocketAccounts.length > 0) {
      draggedPocketGroup.value = {
        parentId: parentAccount.id,
        pocketAccounts: pocketAccounts,
      };
    } else {
      draggedPocketGroup.value = null;
    }
  }, LONG_PRESS_MS);
}

function handleTouchMove(event: TouchEvent, index: number) {
  if (event.touches.length > 1) {
    if (longPressTimer.value != null) {
      clearTimeout(longPressTimer.value);
      longPressTimer.value = null;
    }
    pendingTapRow.value = null;
    pendingTapSubRow.value = null;
    return;
  }

  if (!isDragging.value || draggedIndex.value === null) {
    const touch = event.touches[0];
    const dx = touch.clientX - touchStartX.value;
    const dy = touch.clientY - touchStartY.value;
    if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD_PX * TAP_MOVE_THRESHOLD_PX) {
      if (longPressTimer.value != null) {
        clearTimeout(longPressTimer.value);
        longPressTimer.value = null;
      }
      pendingTapRow.value = null;
      pendingTapSubRow.value = null;
    }
    return;
  }

  event.preventDefault();
  const touch = event.touches[0];
  const currentY = touch.clientY;
  const deltaY = currentY - touchStartY.value;

  const rowHeight = 60;
  const newIndex = Math.max(
    0,
    Math.min(
      draggableAccountRegisters.value.length - 1,
      Math.round(deltaY / rowHeight) + touchStartIndex.value,
    ),
  );

  if (newIndex !== dragOverIndex.value) {
    const draggedParent =
      draggableAccountRegisters.value[draggedIndex.value as number];
    updateDragOverIndexForParentDrag(
      newIndex,
      draggedParent,
      draggableAccountRegisters.value,
    );
  }
}

function handleTouchEnd(event: TouchEvent, index: number) {
  if (longPressTimer.value != null) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }

  if (isDragging.value && draggedIndex.value !== null) {
    event.preventDefault();

    if (
      dragOverIndex.value !== null &&
      draggedIndex.value !== dragOverIndex.value
    ) {
      handleDrop(null as any, dragOverIndex.value as number);
    }

    draggedPocketGroup.value = null;
    draggedIndex.value = null;
    isDragging.value = false;
    dragOverIndex.value = null;
    touchStartY.value = 0;
    touchStartIndex.value = 0;
    pendingTapRow.value = null;
    pendingTapSubRow.value = null;
    return;
  }

  const row = draggableAccountRegisters.value[index];
  if (
    pendingTapRow.value != null &&
    pendingTapRow.value.id === row.id &&
    Date.now() - touchStartTime.value < LONG_PRESS_MS
  ) {
    event.preventDefault();
    event.stopPropagation();
    handleTableClick(pendingTapRow.value);
  }

  pendingTapRow.value = null;
  pendingTapSubRow.value = null;
  touchStartY.value = 0;
  touchStartX.value = 0;
  touchStartTime.value = 0;
  touchStartIndex.value = 0;
}

// Pocket account drag and drop functions
function handlePocketDragStart(
  event: DragEvent,
  subRow: AccountRegister,
  parentId: number,
) {
  if (snapshotMode.isSnapshotMode.value) {
    event.preventDefault();
    return;
  }
  draggedIndex.value = `sub-${subRow.id}`;
  isDragging.value = true;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    const dragElement = event.target as HTMLElement;
    if (dragElement) {
      event.dataTransfer.setDragImage(dragElement, 0, 0);
    }
  }
}

function handlePocketDragOver(
  event: DragEvent,
  subRow: AccountRegister,
  parentId: number,
) {
  event.preventDefault();
  if (
    draggedIndex.value !== null &&
    draggedIndex.value !== `sub-${subRow.id}`
  ) {
    dragOverIndex.value = `sub-${subRow.id}`;
  }
}

function handlePocketDrop(
  event: DragEvent,
  subRow: AccountRegister,
  parentId: number,
) {
  if (
    draggedIndex.value === null ||
    draggedIndex.value === `sub-${subRow.id}`
  ) {
    return;
  }

  // Extract the dragged pocket account ID
  const draggedPocketId = Number.parseInt(
    String(draggedIndex.value).replace("sub-", ""),
    10,
  );

  // Get all pocket accounts for this parent
  const pocketAccounts = listStore.getAccountRegisters
    .filter((f) => f.subAccountRegisterId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const draggedPocketIndex = pocketAccounts.findIndex(
    (p) => p.id === draggedPocketId,
  );
  const dropPocketIndex = pocketAccounts.findIndex((p) => p.id === subRow.id);

  if (draggedPocketIndex === -1 || dropPocketIndex === -1) return;

  // Reorder pocket accounts
  const reorderedPockets = [...pocketAccounts];
  const [draggedItem] = reorderedPockets.splice(draggedPocketIndex, 1);
  reorderedPockets.splice(dropPocketIndex, 0, draggedItem);

  // Update sort orders based on active mode
  const updatedPockets = reorderedPockets.map((item, index) => {
    const updatedItem = { ...item };

    switch (activeSortMode.value) {
      case "loan":
        updatedItem.loanPaymentSortOrder = index;
        break;
      case "savings":
        updatedItem.savingsGoalSortOrder = index;
        break;
      default:
        updatedItem.sortOrder = index;
        break;
    }

    return updatedItem;
  });

  // Call API to update pocket order
  handlePocketDragEnd(updatedPockets);

  draggedIndex.value = null;
  isDragging.value = false;
  dragOverIndex.value = null;
}

// Pocket touch event handlers (long-press to drag, short tap to click)
function handlePocketTouchStart(
  event: TouchEvent,
  subRow: AccountRegister,
  parentId: number,
) {
  if (snapshotMode.isSnapshotMode.value) return;
  if (event.touches.length > 1) return;

  const touch = event.touches[0];
  touchStartTime.value = Date.now();
  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
  touchStartIndex.value = subRow.id;
  pendingTapRow.value = null;
  pendingTapSubRow.value = subRow;

  if (longPressTimer.value != null) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }

  longPressTimer.value = setTimeout(() => {
    longPressTimer.value = null;
    isDragging.value = true;
    draggedIndex.value = `sub-${subRow.id}`;
    pendingTapRow.value = null;
    pendingTapSubRow.value = null;
  }, LONG_PRESS_MS);
}

function handlePocketTouchMove(
  event: TouchEvent,
  subRow: AccountRegister,
  parentId: number,
) {
  if (event.touches.length > 1) {
    if (longPressTimer.value != null) {
      clearTimeout(longPressTimer.value);
      longPressTimer.value = null;
    }
    pendingTapRow.value = null;
    pendingTapSubRow.value = null;
    return;
  }

  if (!isDragging.value || draggedIndex.value === null) {
    const touch = event.touches[0];
    const dx = touch.clientX - touchStartX.value;
    const dy = touch.clientY - touchStartY.value;
    if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD_PX * TAP_MOVE_THRESHOLD_PX) {
      if (longPressTimer.value != null) {
        clearTimeout(longPressTimer.value);
        longPressTimer.value = null;
      }
      pendingTapRow.value = null;
      pendingTapSubRow.value = null;
    }
    return;
  }

  event.preventDefault();
  const touch = event.touches[0];
  const currentY = touch.clientY;
  const deltaY = currentY - touchStartY.value;

  const rowHeight = 60;
  const pocketAccounts = listStore.getAccountRegisters
    .filter((f) => f.subAccountRegisterId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const currentIndex = pocketAccounts.findIndex(
    (p) => p.id === touchStartIndex.value,
  );
  const newIndex = Math.max(
    0,
    Math.min(
      pocketAccounts.length - 1,
      Math.round(deltaY / rowHeight) + currentIndex,
    ),
  );

  if (newIndex !== currentIndex) {
    dragOverIndex.value = `sub-${pocketAccounts[newIndex]?.id}`;
  }
}

function handlePocketTouchEnd(
  event: TouchEvent,
  subRow: AccountRegister,
  parentId: number,
) {
  if (longPressTimer.value != null) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }

  if (isDragging.value && draggedIndex.value !== null) {
    event.preventDefault();

    if (
      dragOverIndex.value !== null &&
      draggedIndex.value !== dragOverIndex.value
    ) {
      const draggedPocketId = Number.parseInt(
        String(draggedIndex.value).replace("sub-", ""),
        10,
      );
      const dropPocketId = Number.parseInt(
        String(dragOverIndex.value).replace("sub-", ""),
        10,
      );

      const pocketAccounts = listStore.getAccountRegisters
        .filter((f) => f.subAccountRegisterId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const draggedPocketIndex = pocketAccounts.findIndex(
        (p) => p.id === draggedPocketId,
      );
      const dropPocketIndex = pocketAccounts.findIndex(
        (p) => p.id === dropPocketId,
      );

      if (draggedPocketIndex !== -1 && dropPocketIndex !== -1) {
        const reorderedPockets = [...pocketAccounts];
        const [draggedItem] = reorderedPockets.splice(draggedPocketIndex, 1);
        reorderedPockets.splice(dropPocketIndex, 0, draggedItem);

        const updatedPockets = reorderedPockets.map((item, index) => {
          const updatedItem = { ...item };

          switch (activeSortMode.value) {
            case "loan":
              updatedItem.loanPaymentSortOrder = index;
              break;
            case "savings":
              updatedItem.savingsGoalSortOrder = index;
              break;
            default:
              updatedItem.sortOrder = index;
              break;
          }

          return updatedItem;
        });

        handlePocketDragEnd(updatedPockets);
      }
    }

    draggedIndex.value = null;
    isDragging.value = false;
    dragOverIndex.value = null;
    touchStartY.value = 0;
    touchStartIndex.value = 0;
    pendingTapRow.value = null;
    pendingTapSubRow.value = null;
    return;
  }

  if (
    pendingTapSubRow.value != null &&
    pendingTapSubRow.value.id === subRow.id &&
    Date.now() - touchStartTime.value < LONG_PRESS_MS
  ) {
    event.preventDefault();
    event.stopPropagation();
    handleTableClick(pendingTapSubRow.value);
  }

  pendingTapRow.value = null;
  pendingTapSubRow.value = null;
  touchStartY.value = 0;
  touchStartX.value = 0;
  touchStartTime.value = 0;
  touchStartIndex.value = 0;
}

function handleDragOver(event: DragEvent, index: number) {
  event.preventDefault();

  // Only allow parent-to-parent dropping
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    const draggedParent =
      draggableAccountRegisters.value[draggedIndex.value as number];
    updateDragOverIndexForParentDrag(
      index,
      draggedParent,
      draggableAccountRegisters.value,
    );
  }
}

function handleDragLeave(event: DragEvent) {
  const target = event.target as HTMLElement;
  const relatedTarget = event.relatedTarget as HTMLElement;

  if (!target.contains(relatedTarget)) {
    dragOverIndex.value = null;
  }
}

function handleDrop(event: DragEvent, dropIndex: number) {
  if (draggedIndex.value === null || draggedIndex.value === dropIndex) {
    return;
  }

  const items = [...draggableAccountRegisters.value];
  const fromIndex = draggedIndex.value as number;
  const draggedItem = items[fromIndex];

  // Remove the dragged item
  items.splice(fromIndex, 1);

  // Insert at the new position
  items.splice(dropIndex, 0, draggedItem);

  // Update the array with new sort orders
  const updatedItems = items.map((item, index) => ({
    ...item,
    sortOrder: index,
  }));

  draggableAccountRegisters.value = updatedItems;

  // Call the API to persist the change
  handleDragEnd({ oldIndex: fromIndex, newIndex: dropIndex });

  // Reset pocket group state
  draggedPocketGroup.value = null;
  draggedIndex.value = null;
  isDragging.value = false;
  dragOverIndex.value = null;
}

const overlay = useOverlay();
const route = useRoute();

const listStore = useListStore();
const authStore = useAuthStore();
const { $api } = useNuxtApp();
const { today } = useToday();
const showShortcuts = ref(false);

const FORECAST_MONTHS_MAX = 24;
const forecastMonthsAhead = ref(0);
const forecastBalancesById = ref<Record<number, number> | null>(null);
const forecastBalancesMeta = ref<{ asOf: string } | null>(null);
const forecastBalancesLoading = ref(false);
const riskAlerts = ref<ForecastRiskAlert[]>([]);
const riskAlertsLoading = ref(false);
const riskActionLoading = ref(false);

const forecastSliderLabel = computed(() => {
  if (forecastMonthsAhead.value === 0) return "Current (live)";
  if (forecastBalancesMeta.value?.asOf) {
    return `End of ${formatDate(forecastBalancesMeta.value.asOf) ?? ""}`.trim();
  }
  return `+${forecastMonthsAhead.value} mo`;
});

watch(forecastMonthsAhead, (m) => {
  if (m === 0) {
    forecastBalancesMeta.value = null;
    forecastBalancesById.value = null;
  }
});

const registersForUi = computed(() =>
  snapshotMode.isSnapshotMode.value &&
  snapshotMode.syntheticAccountRegisters.value.length > 0
    ? snapshotMode.syntheticAccountRegisters.value
    : listStore.getAccountRegisters,
);

const currentBudgetAccountId = computed(
  () =>
    listStore.getAccountRegisters[0]?.accountId ??
    listStore.getAccounts?.[0]?.id ??
    null,
);

const riskAlertByRegisterId = computed(() => {
  const m = new Map<number, ForecastRiskAlert>();
  for (const alert of riskAlerts.value) {
    if (!m.has(alert.accountRegisterId)) {
      m.set(alert.accountRegisterId, alert);
    }
  }
  return m;
});

const topRiskAlert = computed(() => riskAlerts.value[0] ?? null);
const hasRiskAlerts = computed(() => riskAlerts.value.length > 0);

const riskSummaryTitle = computed(() => {
  if (!topRiskAlert.value) return "";
  const count = riskAlerts.value.length;
  if (count === 1) {
    return `Cash-flow risk detected in ${topRiskAlert.value.accountRegisterName}`;
  }
  return `${count} cash-flow risks detected across accounts`;
});

const riskSummaryDescription = computed(() => {
  if (!topRiskAlert.value) return "";
  const when = formatDate(topRiskAlert.value.riskAt) ?? "soon";
  const eta = formatRiskEta(topRiskAlert.value.daysUntilRisk);
  const level =
    topRiskAlert.value.riskType === "below_min_balance"
      ? "below minimum balance"
      : "negative";
  return `${topRiskAlert.value.accountRegisterName} is projected ${level} ${eta} (${when}).`;
});

watch(
  [
    forecastMonthsAhead,
    currentBudgetAccountId,
    () => authStore.getBudgetId,
    () => isSnapshotMode.value,
  ],
  async ([months, aid, budgetId, snap]) => {
    if (snap) {
      forecastBalancesById.value = null;
      forecastBalancesMeta.value = null;
      forecastBalancesLoading.value = false;
      return;
    }
    if (months === 0 || !aid || !budgetId) {
      forecastBalancesLoading.value = false;
      return;
    }

    forecastBalancesLoading.value = true;
    try {
      const data = await ($api as typeof $fetch)<{
        asOf: string;
        balances: Record<number, number>;
      }>("/api/account-registers/forecast-balances", {
        query: {
          accountId: aid,
          budgetId,
          monthsAhead: months,
        },
      });
      forecastBalancesById.value = data.balances;
      forecastBalancesMeta.value = { asOf: data.asOf };
    } catch {
      forecastBalancesById.value = null;
      forecastBalancesMeta.value = null;
      useToast().add({
        color: "error",
        description: "Could not load projected balances.",
      });
    } finally {
      forecastBalancesLoading.value = false;
    }
  },
);

function formatRiskEta(daysUntilRisk: number): string {
  if (daysUntilRisk <= 0) return "today";
  if (daysUntilRisk === 1) return "in 1 day";
  return `in ${daysUntilRisk} days`;
}

function riskAlertForRegister(id: number): ForecastRiskAlert | null {
  return riskAlertByRegisterId.value.get(id) ?? null;
}

async function fetchForecastRiskAlerts() {
  const budgetId = authStore.getBudgetId;
  if (!budgetId || isSnapshotMode.value) {
    riskAlerts.value = [];
    riskAlertsLoading.value = false;
    return;
  }
  riskAlertsLoading.value = true;
  try {
    const data = await ($api as typeof $fetch)<{
      alerts: ForecastRiskAlert[];
    }>("/api/forecast-risk-alerts", {
      query: {
        budgetId,
        daysAhead: 90,
      },
    });
    riskAlerts.value = data.alerts ?? [];
  } catch {
    riskAlerts.value = [];
  } finally {
    riskAlertsLoading.value = false;
  }
}

async function dismissTopRiskAlert() {
  if (!topRiskAlert.value || !authStore.getBudgetId) return;
  riskActionLoading.value = true;
  try {
    const data = await dismissNotification({
      api: $api as typeof $fetch,
      budgetId: authStore.getBudgetId,
      notificationId: topRiskAlert.value.notificationId,
      status: "dismissed",
    });
    riskAlerts.value = data.riskAlerts ?? [];
    dispatchNotificationsRefresh({ reason: "mutation" });
  } catch {
    // Avoid noisy repeated toasts here; banner remains if action failed.
  } finally {
    riskActionLoading.value = false;
  }
}

async function resolveTopRiskAlert() {
  if (!topRiskAlert.value || !authStore.getBudgetId) return;
  riskActionLoading.value = true;
  try {
    const data = await dismissNotification({
      api: $api as typeof $fetch,
      budgetId: authStore.getBudgetId,
      notificationId: topRiskAlert.value.notificationId,
      status: "resolved",
    });
    riskAlerts.value = data.riskAlerts ?? [];
    dispatchNotificationsRefresh({ reason: "mutation" });
  } catch {
    // Avoid noisy repeated toasts here; banner remains if action failed.
  } finally {
    riskActionLoading.value = false;
  }
}

watch(
  [
    () => authStore.getBudgetId,
    () => listStore.getAccountRegisters.length,
    () => isSnapshotMode.value,
  ],
  async ([budgetId, registerCount, snap]) => {
    if (snap || !budgetId || registerCount === 0) {
      riskAlerts.value = [];
      riskAlertsLoading.value = false;
      return;
    }
    await fetchForecastRiskAlerts();
  },
  { immediate: true },
);

async function refreshSnapshotList() {
  const aid = currentBudgetAccountId.value;
  if (!aid) return;
  await snapshotMode.fetchSnapshots(aid);
}

async function handleSaveSnapshot() {
  const aid = currentBudgetAccountId.value;
  if (!aid) {
    useToast().add({
      color: "error",
      description: "No account selected.",
    });
    return;
  }
  const toast = useToast();
  try {
    await ($api as typeof $fetch)("/api/snapshot", {
      method: "POST",
      body: { accountId: aid },
    });
    toast.add({
      color: "success",
      description: "Snapshot saved.",
    });
    await refreshSnapshotList();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to save snapshot.",
    });
  }
}

const isSavingSnapshot = ref(false);

async function handleSaveSnapshotClick() {
  isSavingSnapshot.value = true;
  try {
    await handleSaveSnapshot();
  } finally {
    isSavingSnapshot.value = false;
  }
}

const modal = overlay.create(ModalsEditAccountRegister);
const categoriesModal = overlay.create(ModalsManageCategories);

const selectedAccountRegisterId = ref<number | null>(null);

function handleTableClick(data: AccountRegister) {
  if (snapshotMode.isSnapshotMode.value) return;
  selectedAccountRegisterId.value = data.id;
  const editAccountRegister: ModelAccountRegisterProps = {
    id: data.id,
    title: `Edit '${data.name}' Account`,
    description: "",
    accountRegister: data,
    callback: (data: AccountRegister) => {
      listStore.patchAccountRegister(data);
      modal.close();
    },
    cancel: () => modal.close(),
  };

  modal.open(editAccountRegister);
}

const columns: TableColumn<AccountRegister>[] = [
  {
    accessorKey: "typeId",
    header: () => h("div", {}, "Type"),
    cell: ({ row }) =>
      getAccountTypeLabel(row.getValue("typeId"), listStore.getAccountTypes),
  },
  {
    accessorKey: "name",
    header: () => h("div", { class: "min-w-lg" }, "Name"),
    cell: ({ row }) =>
      h(
        "div",
        {
          role: "button",
          tabindex: 0,
          class: "cursor-pointer",
          onClick: () => handleTableClick(row.original),
          onKeydown: (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleTableClick(row.original);
            }
          },
        },
        row.getValue("name"),
      ),
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

function handleAddAccountRegister() {
  if (snapshotMode.isSnapshotMode.value) return;
  const addAccountRegister: ModelAccountRegisterProps = {
    id: 0,
    title: `Add Account`,
    description: "",
    accountRegister: {
      id: 0,
      budgetId: authStore.getBudgetId,
      accountId: listStore.getAccounts?.[0]?.id ?? "",
      name: "",
      typeId: 0,
      balance: 0,
      latestBalance: 0,
      minPayment: null,
      subAccountRegisterId: undefined,
      statementAt: today.value,
      statementIntervalId: 3,
      apr1: null,
      apr1StartAt: null,
      apr2: null,
      apr2StartAt: null,
      apr3: null,
      apr3StartAt: null,
      targetAccountRegisterId: null,
      collateralAssetRegisterId: null,
      loanStartAt: null,
      loanPaymentsPerYear: null,
      loanTotalYears: null,
      loanOriginalAmount: null,
      sortOrder: 0,
      loanPaymentSortOrder: 0,
      savingsGoalSortOrder: 0,
      accountSavingsGoal: null,
      minAccountBalance: 0,
      allowExtraPayment: false,
      isArchived: false,
      depreciationRate: null,
      depreciationMethod: null,
      assetOriginalValue: null,
      assetResidualValue: null,
      assetUsefulLifeYears: null,
      assetStartAt: null,
      paymentCategoryId: undefined,
      interestCategoryId: undefined,
      vehicleDetails: null,
    },
    callback: (data: AccountRegister) => {
      listStore.patchAccountRegister(data);
      modal.close();
    },
    cancel: () => modal.close(),
  };
  modal.open(addAccountRegister);
}

function handleManageCategories() {
  const selectedAccountId = selectedAccountRegisterId.value
    ? listStore.getAccountRegisters.find(
        (r) => r.id === selectedAccountRegisterId.value,
      )?.accountId
    : null;

  const accountId =
    selectedAccountId ??
    listStore.getAccountRegisters[0]?.accountId ??
    listStore.getAccounts?.[0]?.id;
  if (!accountId) {
    return;
  }
  categoriesModal.open({
    accountId,
    callback: () => {
      categoriesModal.close();
    },
    cancel: () => categoriesModal.close(),
  });
}

function formatCurrencyClass(balance: number): string {
  return `text-right ${+balance < 0 ? "dark:text-red-300 text-red-700" : ""}`;
}

function formatCurrency(balance: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(balance);
}

function isCreditRegister(reg: AccountRegister): boolean {
  return (
    listStore.getAccountTypes.find((t) => t.id === reg.typeId)?.isCredit ===
    true
  );
}

function effectiveRegisterBalance(reg: AccountRegister): number {
  if (
    isSnapshotMode.value ||
    forecastMonthsAhead.value === 0 ||
    !forecastBalancesById.value
  ) {
    return +reg.balance;
  }
  const v = forecastBalancesById.value[reg.id];
  return v ?? +reg.balance;
}

/** Debit / credit / net for accounts table (linked loan+asset or standalone). */
function registerDebitCreditNet(
  row: AccountRegister,
  isSubRow: boolean,
): { debit: number | null; credit: number | null; net: number | null } {
  if (isSubRow) {
    const b = effectiveRegisterBalance(row);
    if (b < 0) {
      return { debit: Math.abs(b), credit: null, net: b };
    }
    return { debit: null, credit: b, net: b };
  }
  const registers = registersForUi.value;
  const linkedLoan = registers.find(
    (r) =>
      !r.subAccountRegisterId &&
      r.collateralAssetRegisterId === row.id &&
      r.id !== row.id,
  );
  if (linkedLoan && !isCreditRegister(row)) {
    const assetBal = effectiveRegisterBalance(row);
    const loanBalAbs = Math.abs(effectiveRegisterBalance(linkedLoan));
    return {
      debit: loanBalAbs,
      credit: assetBal,
      net: assetBal - loanBalAbs,
    };
  }
  const collateralId = row.collateralAssetRegisterId;
  if (collateralId && isCreditRegister(row) && !row.subAccountRegisterId) {
    const asset = registers.find((r) => r.id === collateralId);
    if (asset) {
      const assetBal = effectiveRegisterBalance(asset);
      const loanBalAbs = Math.abs(effectiveRegisterBalance(row));
      return {
        debit: loanBalAbs,
        credit: assetBal,
        net: assetBal - loanBalAbs,
      };
    }
  }
  if (isCreditRegister(row)) {
    const b = effectiveRegisterBalance(row);
    return {
      debit: Math.abs(b),
      credit: null,
      net: -Math.abs(b),
    };
  }
  return {
    debit: null,
    credit: effectiveRegisterBalance(row),
    net: effectiveRegisterBalance(row),
  };
}

// Drag and drop functionality
const toast = useToast();

// Drag and drop state
const draggedIndex = ref<number | string | null>(null);
const isDragging = ref(false);
const dragOverIndex = ref<number | string | null>(null);

function updateDragOverIndexForParentDrag(
  newIndex: number,
  draggedParent: AccountRegister,
  parentRows: AccountRegister[],
): void {
  if (draggedParent.subAccountRegisterId != null) {
    dragOverIndex.value = newIndex;
    return;
  }
  const targetParent = parentRows[newIndex];
  if (targetParent.subAccountRegisterId == null) {
    dragOverIndex.value = newIndex;
  }
}

// Touch state for mobile
const LONG_PRESS_MS = 450;
const TAP_MOVE_THRESHOLD_PX = 10;

const touchStartY = ref(0);
const touchStartX = ref(0);
const touchStartTime = ref(0);
const touchStartIndex = ref(0);
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const pendingTapRow = ref<AccountRegister | null>(null);
const pendingTapSubRow = ref<AccountRegister | null>(null);

// Pocket group dragging state
const draggedPocketGroup = ref<{
  parentId: number;
  pocketAccounts: AccountRegister[];
} | null>(null);

// Collapsed state for pocket accounts - initialize all parents with pockets as collapsed
const collapsedParents = ref<Set<number>>(new Set());

// Sort mode state
const activeSortMode = ref<AccountRegisterSortMode>("visual");

function pocketSubs(parentId: number) {
  const mode = activeSortMode.value;
  return registersForUi.value
    .filter((f) => f.subAccountRegisterId === parentId)
    .sort((a, b) => {
      switch (mode) {
        case "loan":
          return a.loanPaymentSortOrder - b.loanPaymentSortOrder;
        case "savings":
          return a.savingsGoalSortOrder - b.savingsGoalSortOrder;
        default:
          return a.sortOrder - b.sortOrder;
      }
    });
}

const showCrossAccountSnapshot = ref(false);
const showProjectedBalanceTimeline = ref(false);

// Tab items for sort mode selection
const tabItems = computed(() => [
  { key: "visual", label: "Visual Order", icon: "i-lucide-layout-grid" },
  { key: "loan", label: "Loan Payment", icon: "i-lucide-credit-card" },
  { key: "savings", label: "Savings Goal", icon: "i-lucide-target" },
]);

// Dropdown menu items for Sort button (options hidden until Sort is clicked)
const sortMenuItems = computed(() => [
  [
    ...tabItems.value.map((item) => ({
      label: item.label,
      icon: item.icon,
      onSelect: () => {
        activeSortMode.value = item.key as AccountRegisterSortMode;
      },
    })),
  ],
]);

// Initialize all parents with pocket accounts as collapsed
watch(
  () => listStore.getAccountRegisters,
  (accountRegisters) => {
    if (accountRegisters.length > 0) {
      const parentsWithPockets = accountRegisters
        .filter((account) => !account.subAccountRegisterId)
        .filter((parent) =>
          accountRegisters.some(
            (pocket) => pocket.subAccountRegisterId === parent.id,
          ),
        )
        .map((parent) => parent.id);

      collapsedParents.value = new Set(parentsWithPockets);
    }
  },
  { immediate: true },
);

// Toggle pocket accounts visibility
function togglePocketAccounts(parentId: number) {
  if (collapsedParents.value.has(parentId)) {
    collapsedParents.value.delete(parentId);
  } else {
    collapsedParents.value.add(parentId);
  }
}

// Get sort field based on active mode
function getSortField(account: AccountRegister): number {
  switch (activeSortMode.value) {
    case "loan":
      return account.loanPaymentSortOrder;
    case "savings":
      return account.savingsGoalSortOrder;
    default:
      return account.sortOrder;
  }
}

// Sort accounts based on active mode
function sortAccounts(accounts: AccountRegister[]): AccountRegister[] {
  return [...accounts].sort((a, b) => getSortField(a) - getSortField(b));
}

async function handleDragEnd(event: any) {
  // Check if the item was actually moved (not just clicked)
  if (event.oldIndex === event.newIndex) {
    return;
  }

  const newOrder = draggableAccountRegisters.value.map(
    (item: AccountRegister, index: number) => {
      const updatedItem = { ...item };

      switch (activeSortMode.value) {
        case "loan":
          updatedItem.loanPaymentSortOrder = index;
          break;
        case "savings":
          updatedItem.savingsGoalSortOrder = index;
          break;
        default:
          updatedItem.sortOrder = index;
          break;
      }

      return updatedItem;
    },
  );

  try {
    await $api("/api/account-register-sort", {
      method: "POST",
      body: {
        accountRegisters: newOrder,
        sortMode: activeSortMode.value as AccountRegisterSortMode,
      },
    });

    // Update the store with new order
    listStore.updateAccountRegistersOrder(newOrder);

    toast.add({
      color: "success",
      description: "Account order updated successfully.",
    });
  } catch (error) {
    console.error("Error updating sort order:", error);
    toast.add({
      color: "error",
      description: "Failed to update account order.",
    });
  }
}

async function handlePocketDragEnd(updatedPockets: AccountRegister[]) {
  try {
    await $api("/api/account-register-sort", {
      method: "POST",
      body: {
        accountRegisters: updatedPockets,
        sortMode: activeSortMode.value as AccountRegisterSortMode,
      },
    });

    // Update the store with new pocket order
    listStore.updateAccountRegistersOrder(updatedPockets);

    toast.add({
      color: "success",
      description: "Pocket account order updated successfully.",
    });
  } catch (error) {
    console.error("Error updating pocket sort order:", error);
    toast.add({
      color: "error",
      description: "Failed to update pocket account order.",
    });
  }
}

const globalFilter = ref("");
const categoryFilter = ref(CATEGORY_FILTER_ALL);
/** Satisfies `FiltersCombinedGlobalCategoryFilter` props when category dropdown is hidden. */
const accountRegistersCategoryFilterItems: {
  label: string;
  value: string;
  name: string;
}[] = [];
const combinedTableFilterRef = ref<{
  collapse: () => void;
  expandAndFocus: () => Promise<void>;
} | null>(null);

defineShortcuts({
  escape: {
    usingInput: true,
    handler: () => {
      globalFilter.value = "";
      categoryFilter.value = CATEGORY_FILTER_ALL;
      combinedTableFilterRef.value?.collapse();
    },
  },
  meta_a: () => handleAddAccountRegister(),
  meta_f: () => {
    combinedTableFilterRef.value?.expandAndFocus()?.catch(() => {});
  },
});

const filteredAccountRegisters = computed(() => {
  const filterText = globalFilter.value.toLowerCase();
  const filtered = registersForUi.value.filter((f) => {
    const matchesFilter =
      !filterText || f.name.toLowerCase().includes(filterText);
    return matchesFilter && !f.subAccountRegisterId;
  });
  return sortAccounts(filtered);
});

const mainRegisterCount = computed(
  () => registersForUi.value.filter((r) => !r.subAccountRegisterId).length,
);

/** Filter hid every main account, but the user still has accounts (bad search), not a true empty budget. */
const isSearchNoMatches = computed(
  () =>
    globalFilter.value.trim().length > 0 &&
    mainRegisterCount.value > 0 &&
    filteredAccountRegisters.value.length === 0,
);

const showFirstAccountOnboarding = computed(
  () =>
    !listStore.getIsListsLoading &&
    filteredAccountRegisters.value.length === 0 &&
    !isSearchNoMatches.value,
);

function mainRowDcn(row: AccountRegister) {
  return registerDebitCreditNet(row, false);
}

function subRowDcn(subRow: AccountRegister) {
  return registerDebitCreditNet(subRow, true);
}

/** True when at least one account has a linked asset (loan+asset pair exists). */
const showDebitCreditColumns = computed(() =>
  registersForUi.value.some(
    (r) =>
      r.collateralAssetRegisterId != null && r.collateralAssetRegisterId > 0,
  ),
);

const accountsTableColspan = computed(() =>
  showDebitCreditColumns.value ? 6 : 4,
);

// Only main accounts for draggable (no sub-accounts)
const draggableAccountRegisters = ref<AccountRegister[]>([]);

// Watch for changes in filteredAccountRegisters and update draggableAccountRegisters
watch(
  filteredAccountRegisters,
  (newValue) => {
    draggableAccountRegisters.value = [...newValue];
  },
  { immediate: true },
);

const estimatedNetWorth = computed(() => {
  return registersForUi.value.reduce((acc, curr) => {
    if (curr.typeId !== 15) {
      acc += effectiveRegisterBalance(curr);
    }

    return acc;
  }, 0);
});

/** Main registers only: lowest computed balance + risk signal for cross-account snapshot */
const accountLiquiditySnapshot = computed(() => {
  const mains = registersForUi.value.filter((r) => !r.subAccountRegisterId);
  if (mains.length === 0) return null;
  const withNet = mains.map((r) => ({
    register: r,
    net: registerDebitCreditNet(r, false).net ?? 0,
  }));
  let lowest = withNet[0]!;
  for (const item of withNet) {
    if (item.net < lowest.net) lowest = item;
  }
  const negativeCount = withNet.filter((item) => item.net < 0).length;
  return {
    lowest: lowest.register,
    lowestComputedBalance: lowest.net,
    negativeCount,
    mainCount: mains.length,
  };
});

onMounted(async () => {
  import("~/components/modals/EditAccountRegister.vue").catch(() => {});
  if (route.query.onboarding === "1") {
    toast.add({
      color: "success",
      description: "Welcome! Add your first account to start forecasting.",
    });
  }
});

onBeforeUnmount(() => {
  if (longPressTimer.value != null) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
});

watch(workflowMode, (w) => {
  if (w === "reconciliation") {
    showProjectedBalanceTimeline.value = false;
    showCrossAccountSnapshot.value = false;
  }
});
</script>

<template lang="pug">
  section(class="my-4 mx-2")
    h1(class="sr-only") Accounts
    UAlert(
      v-if="isSnapshotMode && activeSnapshotCreatedAt"
      color="info"
      variant="subtle"
      class="mb-4"
      :title="`Viewing snapshot (${formatDate(activeSnapshotCreatedAt) ?? ''})`"
    )
      template(#description)
        .flex.flex-wrap.gap-2.items-center
          span Read-only — balances and registers as captured.
          UButton(size="xs" variant="soft" @click="exitSnapshotView") Exit snapshot
    UAlert(
      v-else-if="workflowMode === 'forecasting'"
      color="primary"
      variant="subtle"
      class="mb-4"
      title="Forecasting — Accounts"
    )
      template(#description)
        span.frog-text-muted Balances and ordering for planning. Use the chart icon for projected end-of-month balances after Recalc.
    UAlert(
      v-else
      color="neutral"
      variant="subtle"
      class="mb-4"
      title="Reconciliation — Accounts"
    )
      template(#description)
        span.frog-text-muted Live balances for monitoring. Use Register (Past) and Reconciliation for statement matching — forecast tools are hidden in this workflow.
    div(v-if="draggableAccountRegisters.length === 0" class="w-full min-w-0 flex flex-wrap xl:flex-nowrap items-center gap-2 mb-4")
      RegisterListToolbar(
        v-model:global-filter="globalFilter"
        v-model:show-shortcuts="showShortcuts"
        :show-add="!isSnapshotMode"
        :show-refresh="false"
        add-tooltip="Add account"
        add-title="Add account"
        add-aria-label="Add account"
        @add="handleAddAccountRegister"
      )
        template(#middle)
          UTooltip(text="Manage categories" :delay-duration="150")
            BaseIconButton(
              icon="i-lucide-tags"
              title="Manage categories"
              aria-label="Manage categories"
              :disabled="!listStore.getAccountRegisters[0]?.accountId && !listStore.getAccounts?.[0]?.id"
              @click="handleManageCategories"
            )
          UTooltip(v-if="workflowMode === 'forecasting'" text="Save snapshot" :delay-duration="150")
            BaseIconButton(
              icon="i-lucide-save"
              title="Save snapshot"
              aria-label="Save snapshot"
              :loading="isSavingSnapshot"
              :disabled="!currentBudgetAccountId || !!isSnapshotMode"
              @click="handleSaveSnapshotClick"
            )
          UDropdownMenu(:items="sortMenuItems")
            UTooltip(text="Sort accounts" :delay-duration="150")
              BaseIconButton(
                icon="i-lucide-arrow-up-down"
                title="Sort accounts"
                aria-label="Sort accounts"
                :disabled="!!isSnapshotMode"
              )
          UDropdownMenu(:items="snapshotMenuItems")
            UTooltip(:text="`Snapshot view: ${selectedSnapshotLabel}`" :delay-duration="150")
              BaseIconButton(
                icon="i-lucide-camera"
                :active="!!isSnapshotMode"
                :title="`Snapshot view: ${selectedSnapshotLabel}`"
                :aria-label="`Snapshot view: ${selectedSnapshotLabel}`"
              )
          UTooltip(v-if="workflowMode === 'forecasting'" text="Projected balance (end of month)" :delay-duration="150")
            BaseIconButton(
              icon="i-lucide-line-chart"
              :active="showProjectedBalanceTimeline"
              title="Projected balance timeline"
              aria-label="Toggle projected balance timeline"
              :disabled="!!isSnapshotMode || draggableAccountRegisters.length === 0"
              @click="showProjectedBalanceTimeline = !showProjectedBalanceTimeline"
            )
        template(#filter)
          FiltersCombinedGlobalCategoryFilter(
            ref="combinedTableFilterRef"
            v-model:global-filter="globalFilter"
            v-model:category-filter="categoryFilter"
            :category-items="accountRegistersCategoryFilterItems"
            :show-category-filter="false"
            filter-input-id="search"
            input-class="min-w-[8rem] sm:max-w-48 lg:max-w-48 grow"
          )
        template(#trailing)
          .ml-auto(
            v-if="workflowMode === 'forecasting'"
            class="text-muted text-right cursor-pointer select-none hover:opacity-80 transition-opacity text-sm shrink-0"
            role="button"
            tabindex="0"
            @click="showCrossAccountSnapshot = !showCrossAccountSnapshot"
            @keydown.enter.prevent="showCrossAccountSnapshot = !showCrossAccountSnapshot"
            @keydown.space.prevent="showCrossAccountSnapshot = !showCrossAccountSnapshot"
          )
            span Your estimated net worth
            b.text-nowrap
              | &nbsp;
              DollarFormat(:amount="estimatedNetWorth")
              | &nbsp;
          .ml-auto(
            v-else
            class="text-muted text-right text-sm shrink-0")
            span Your estimated net worth
            b.text-nowrap
              | &nbsp;
              DollarFormat(:amount="estimatedNetWorth")
              | &nbsp;

    UAlert(
      v-if="!isSnapshotMode && hasRiskAlerts && workflowMode === 'forecasting'"
      class="mb-4"
      color="warning"
      variant="subtle"
      :title="riskSummaryTitle"
    )
      template(#description)
        .flex.flex-wrap.items-center.gap-2
          span {{ riskSummaryDescription }}
          UButton(
            v-if="topRiskAlert"
            size="xs"
            variant="soft"
            :to="`/register/${topRiskAlert.accountRegisterId}`"
          ) Open highest-risk register
          UButton(
            v-if="topRiskAlert"
            size="xs"
            variant="ghost"
            :loading="riskActionLoading"
            :disabled="riskActionLoading"
            @click="resolveTopRiskAlert"
          ) Mark resolved
          UButton(
            v-if="topRiskAlert"
            size="xs"
            variant="ghost"
            :loading="riskActionLoading"
            :disabled="riskActionLoading"
            @click="dismissTopRiskAlert"
          ) Dismiss

    div(
      v-if="workflowMode === 'forecasting' && showProjectedBalanceTimeline && !isSnapshotMode && draggableAccountRegisters.length > 0"
      class="w-full mb-4 flex flex-col gap-2 rounded-lg border border-default px-3 py-3 bg-elevated/40"
    )
      div(class="flex flex-col sm:flex-row sm:items-center gap-3")
        div(class="flex-1 min-w-0")
          div(class="text-sm text-highlighted font-medium") Projected balance (end of month)
          input(
            type="range"
            class="w-full h-2 rounded-full cursor-pointer accent-primary"
            :min="0"
            :max="FORECAST_MONTHS_MAX"
            step="1"
            v-model.number="forecastMonthsAhead"
            aria-label="Months ahead for projected balance"
          )
        div(class="flex items-center gap-2 shrink-0 text-sm")
          span(class="frog-text-muted") {{ forecastSliderLabel }}
          UIcon(v-if="forecastBalancesLoading" name="i-lucide-loader-2" class="animate-spin frog-text-muted")
      p(class="text-xs frog-text-muted") Projected from forecast; run recalculate if numbers look stale.

    UCard(v-if="showShortcuts" class="my-4")
      template(#header)
        h3(class="font-semibold") Keyboard shortcuts
      ul(class="space-y-2 text-sm")
        li Clear text filter: ⎋
        li Add account: ⌘ + A
        li Open filters &amp; focus search: ⌘ + F

    UCard(v-if="isSearchNoMatches" class="my-4")
      template(#header)
        h3(class="font-semibold") No matching accounts
      p(class="frog-text-muted mb-4") No account names match your search. Try another term or clear the filter (⎋).
      UButton(variant="soft" size="sm" @click="globalFilter = ''") Clear search

    UCard(v-else-if="showFirstAccountOnboarding" class="my-4")
      template(#header)
        h3(class="font-semibold") Create your first account
      p(class="frog-text-muted mb-4") Start with an account and opening balance, add recurring items, then run Recalc to see your forecast.
      ol(class="list-decimal ml-4 mb-4 text-sm space-y-1")
        li Add an account register and set an opening balance
        li Add recurring entries (paychecks, bills, subscriptions)
        li Run Recalc to generate projected entries
        li Optional: link banks via Profile &rarr; Sync accounts
      UButton(color="primary" size="sm" @click="handleAddAccountRegister") Add first account

    div(
      v-else-if="listStore.getIsListsLoading"
      class="relative h-fit w-full overflow-x-auto rounded-md border border-primary/40 p-2 sm:p-4"
    )
      div(class="grid grid-cols-4 gap-2 sm:gap-4 pb-3 border-b border-default")
        USkeleton(class="h-4 w-8")
        USkeleton(class="h-4 w-14")
        USkeleton(class="h-4 w-24")
        USkeleton(class="h-4 w-16 ml-auto")
      .space-y-3.pt-3
        div(class="grid grid-cols-4 gap-2 sm:gap-4 items-center" v-for="i in 12" :key="`acct-skeleton-${i}`")
          USkeleton(class="h-4 w-6")
          USkeleton(class="h-4 w-16")
          USkeleton(class="h-4 w-28")
          USkeleton(class="h-4 w-18 ml-auto")

    UCard(v-if="workflowMode === 'forecasting' && showCrossAccountSnapshot && accountLiquiditySnapshot && draggableAccountRegisters.length > 0" class="my-4")
      template(#header)
        h3(class="font-semibold") Cross-account snapshot
      p(class="text-sm frog-text-muted")
        | Lowest balance among main accounts:&nbsp;
        b(class="frog-text") {{ accountLiquiditySnapshot.lowest.name }}
        | &nbsp;at&nbsp;
        b(:class="formatCurrencyClass(accountLiquiditySnapshot.lowestComputedBalance)") {{ formatCurrency(accountLiquiditySnapshot.lowestComputedBalance) }}
      p(v-if="accountLiquiditySnapshot.negativeCount > 0" class="text-sm mt-2 text-amber-700 dark:text-amber-300")
        | {{ accountLiquiditySnapshot.negativeCount }} of {{ accountLiquiditySnapshot.mainCount }} main accounts have negative computed balance — review registers and recurring items.
      p(v-else class="text-sm mt-2 frog-text-muted") All main accounts are at or above zero right now.
      div(class="mt-3")
        UButton(
          v-if="accountLiquiditySnapshot.lowest.id"
          size="xs"
          variant="soft"
          :to="`/register/${accountLiquiditySnapshot.lowest.id}`") Open lowest-balance register

    div(
      v-if="draggableAccountRegisters.length > 0"
      class="accounts-table-outer mt-2 min-w-0 w-full rounded-md border border-primary/40")
      table.accounts-main-table(
        class="w-full min-w-full table-fixed border-separate border-spacing-0 text-xs sm:text-sm"
        aria-label="Account registers with balances"
      )
        colgroup(v-if="showDebitCreditColumns")
          col(style="width:5%")
          col(style="width:14%")
          col(style="width:42%")
          col(style="width:13%")
          col(style="width:13%")
          col(style="width:13%")
        colgroup(v-else)
          col(style="width:5%")
          col(style="width:14%")
          col(style="width:56%")
          col(style="width:25%")
        thead.accounts-sticky-thead
          tr
            th(
              :colspan="accountsTableColspan"
              scope="colgroup"
              class="accounts-table-controls-th accounts-thead-sticky-th sticky top-(--ui-header-height) z-38 overflow-hidden rounded-t-md border-b border-default bg-default/95 backdrop-blur-md supports-backdrop-filter:bg-default/90 p-0 align-top font-normal"
            )
              div.accounts-sticky-head
                div(class="flex flex-col min-h-0")
                  div(class="flex gap-2 border-b border-default px-2 py-2 items-center flex-wrap xl:flex-nowrap")
                    div(class="min-w-0 flex-1 flex items-center gap-2")
                      RegisterListToolbar(
                        v-model:global-filter="globalFilter"
                        v-model:show-shortcuts="showShortcuts"
                        :show-add="!isSnapshotMode"
                        :show-refresh="false"
                        add-tooltip="Add account"
                        add-title="Add account"
                        add-aria-label="Add account"
                        @add="handleAddAccountRegister"
                      )
                        template(#middle)
                          UTooltip(text="Manage categories" :delay-duration="150")
                            BaseIconButton(
                              icon="i-lucide-tags"
                              title="Manage categories"
                              aria-label="Manage categories"
                              :disabled="!listStore.getAccountRegisters[0]?.accountId && !listStore.getAccounts?.[0]?.id"
                              @click="handleManageCategories"
                            )
                          UTooltip(v-if="workflowMode === 'forecasting'" text="Save snapshot" :delay-duration="150")
                            BaseIconButton(
                              icon="i-lucide-save"
                              title="Save snapshot"
                              aria-label="Save snapshot"
                              :loading="isSavingSnapshot"
                              :disabled="!currentBudgetAccountId || !!isSnapshotMode"
                              @click="handleSaveSnapshotClick"
                            )
                          UDropdownMenu(:items="sortMenuItems")
                            UTooltip(text="Sort accounts" :delay-duration="150")
                              BaseIconButton(
                                icon="i-lucide-arrow-up-down"
                                title="Sort accounts"
                                aria-label="Sort accounts"
                                :disabled="!!isSnapshotMode"
                              )
                          UDropdownMenu(:items="snapshotMenuItems")
                            UTooltip(:text="`Snapshot view: ${selectedSnapshotLabel}`" :delay-duration="150")
                              BaseIconButton(
                                icon="i-lucide-camera"
                                :active="!!isSnapshotMode"
                                :title="`Snapshot view: ${selectedSnapshotLabel}`"
                                :aria-label="`Snapshot view: ${selectedSnapshotLabel}`"
                              )
                          UTooltip(v-if="workflowMode === 'forecasting'" text="Projected balance (end of month)" :delay-duration="150")
                            BaseIconButton(
                              icon="i-lucide-line-chart"
                              :active="showProjectedBalanceTimeline"
                              title="Projected balance timeline"
                              aria-label="Toggle projected balance timeline"
                              :disabled="!!isSnapshotMode || draggableAccountRegisters.length === 0"
                              @click="showProjectedBalanceTimeline = !showProjectedBalanceTimeline"
                            )
                        template(#filter)
                          FiltersCombinedGlobalCategoryFilter(
                            ref="combinedTableFilterRef"
                            v-model:global-filter="globalFilter"
                            v-model:category-filter="categoryFilter"
                            :category-items="accountRegistersCategoryFilterItems"
                            :show-category-filter="false"
                            filter-input-id="search"
                            input-class="min-w-[8rem] sm:max-w-48 lg:max-w-48 grow"
                          )
                        template(#trailing)
                          .ml-auto(
                            v-if="workflowMode === 'forecasting'"
                            class="text-muted text-right cursor-pointer select-none hover:opacity-80 transition-opacity text-sm shrink-0"
                            role="button"
                            tabindex="0"
                            @click="showCrossAccountSnapshot = !showCrossAccountSnapshot"
                            @keydown.enter.prevent="showCrossAccountSnapshot = !showCrossAccountSnapshot"
                            @keydown.space.prevent="showCrossAccountSnapshot = !showCrossAccountSnapshot"
                          )
                            span Your estimated net worth
                            b.text-nowrap
                              | &nbsp;
                              DollarFormat(:amount="estimatedNetWorth")
                              | &nbsp;
                          .ml-auto(
                            v-else
                            class="text-muted text-right text-sm shrink-0")
                            span Your estimated net worth
                            b.text-nowrap
                              | &nbsp;
                              DollarFormat(:amount="estimatedNetWorth")
                              | &nbsp;
                  div(
                    v-if="showDebitCreditColumns"
                    class="accounts-inner-head-grid accounts-inner-head-grid--6 w-full border-t border-default bg-default text-xs sm:text-sm font-semibold text-default"
                  )
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0 text-left rtl:text-right")
                      span(class="sr-only") Drag handle
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0 text-left rtl:text-right") Type
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0 text-left rtl:text-right") Account Name
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default whitespace-nowrap") Debit
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default whitespace-nowrap") Credit
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default whitespace-nowrap") Balance
                  div(
                    v-else
                    class="accounts-inner-head-grid accounts-inner-head-grid--4 w-full border-t border-default bg-default text-xs sm:text-sm font-semibold text-default"
                  )
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0 text-left rtl:text-right")
                      span(class="sr-only") Drag handle
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0 text-left rtl:text-right") Type
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 border-b border-default min-w-0 text-left rtl:text-right") Account Name
                    div(class="px-2 sm:px-4 py-2 sm:py-3.5 text-right border-b border-default whitespace-nowrap") Balance

        tbody(class="w-full relative")
          // Drop zone indicator when dragging
          tr(v-if="isDragging" class="h-2 bg-primary/20 border-2 border-dashed border-primary/60 transition-all duration-200")
            td(:colspan="accountsTableColspan" class="p-0")
              div(class="h-2 bg-linear-to-r from-(--frog-primary) to-(--frog-accent) animate-pulse")

          // Main accounts with their sub-accounts grouped together
          template(v-for="(row, index) in draggableAccountRegisters" :key="`main-${row.id}`")
            // Main account row (draggable)
            tr(
              :class="`odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700 transition-all duration-200 ease-in-out ${isDragging && draggedIndex === index ? 'opacity-30 scale-95 transform rotate-1 shadow-lg bg-yellow-50 dark:bg-yellow-900/20' : ''} ${isDragging && draggedPocketGroup && draggedPocketGroup.parentId === row.id ? 'bg-yellow-50 dark:bg-yellow-900/20 border-t-2 border-l-2 border-r-2 border-yellow-400 dark:border-yellow-600' : ''} ${dragOverIndex === index && isDragging ? 'border-t-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 animate-pulse' : ''} ${dragOverIndex === index + 1 && isDragging ? 'border-b-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 animate-pulse' : ''} ${isDragging && draggedIndex !== index ? 'hover:bg-blue-100 dark:hover:bg-blue-800/30' : ''}`"
              :draggable="!isSnapshotMode"
              @dragstart="handleDragStart($event, index)"
              @dragover="handleDragOver($event, index)"
              @dragleave="handleDragLeave($event)"
              @drop="handleDrop($event, index)"
              @dragenter.prevent
              @touchstart="handleTouchStart($event, index)"
              @touchmove="handleTouchMove($event, index)"
              @touchend="handleTouchEnd($event, index)"
              style="touch-action: pan-y;"
            )
              td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default")
                a(
                  v-if="!isSnapshotMode"
                  :aria-label="`Drag to reorder ${row.name}`"
                  role="button"
                  class="cursor-grab drag-handle transition-all duration-200 hover:scale-110 frog-link active:cursor-grabbing touch-manipulation p-1 sm:p-0")
                  UIcon(name="i-lucide-grip-vertical" class="frog-text-muted text-lg sm:text-base")
              td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default") {{ getAccountTypeLabel(row.typeId, listStore.getAccountTypes) }}
              td(class="min-w-0 p-2 sm:p-4 text-xs sm:text-sm text-muted border-b border-default")
                div(class="flex items-center min-w-0")
                  button(
                    v-if="pocketSubs(row.id).length > 0"
                    type="button"
                    :aria-expanded="!collapsedParents.has(row.id)"
                    :aria-label="`${collapsedParents.has(row.id) ? 'Expand' : 'Collapse'} pocket accounts for ${row.name}`"
                    @click="togglePocketAccounts(row.id)"
                    class="cursor-pointer mr-2 transition-transform duration-200 hover:scale-110"
                    :class="collapsedParents.has(row.id) ? 'rotate-0' : 'rotate-90'"
                  )
                    UIcon(name="i-lucide-chevron-right" class="frog-text-muted text-sm")
                  div(@click.prevent="handleTableClick(row)" role="button" tabindex="0" @keydown.enter.prevent="handleTableClick(row)" class="cursor-pointer font-semibold frog-text truncate min-w-0") {{ row.name }}
                  div(
                    v-if="riskAlertForRegister(row.id)"
                    class="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                  )
                    UIcon(name="i-lucide-triangle-alert" class="text-xs")
                    span {{ formatRiskEta(riskAlertForRegister(row.id)?.daysUntilRisk ?? 0) }}
              template(v-for="dcn in [mainRowDcn(row)]" :key="`dcn-${row.id}`")
                td(v-if="showDebitCreditColumns" class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap border-b border-default")
                  DollarFormat(:amount="dcn.debit != null ? -Math.abs(dcn.debit) : null")
                td(v-if="showDebitCreditColumns" class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap border-b border-default")
                  DollarFormat(:amount="dcn.credit")
                td(class="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap text-right border-b border-default")
                  DollarFormat(:amount="dcn.net")

            // Sub-accounts for this main account (draggable pocket accounts)
            template(v-if="!row.subAccountRegisterId && !collapsedParents.has(row.id)")
              tr(
                v-for="(subRow, subIndex) in pocketSubs(row.id)"
                :key="`sub-${subRow.id}`"
                :class="`odd:bg-gray-100 even:bg-white dark:odd:bg-gray-700 dark:even:bg-gray-700/85 transition-all duration-200 ease-in-out border-l-2 border-l-green-200 dark:border-l-green-700/50 ${isDragging && draggedIndex === `sub-${subRow.id}` ? 'opacity-30 scale-95 transform rotate-1 shadow-lg bg-green-50 dark:bg-green-900/20 border-2 border-green-400 dark:border-green-600' : ''} ${isDragging && draggedPocketGroup && draggedPocketGroup.parentId === row.id ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-r-2 border-yellow-400 dark:border-yellow-600' : ''} ${isDragging && draggedPocketGroup && draggedPocketGroup.parentId === row.id && subIndex === pocketSubs(row.id).length - 1 ? 'border-b-2 border-yellow-400 dark:border-yellow-600' : ''} ${dragOverIndex === `sub-${subRow.id}` && isDragging ? 'border-t-4 border-green-500 bg-green-50 dark:bg-green-900/20 animate-pulse' : ''} ${dragOverIndex === `sub-${subRow.id}-next` && isDragging ? 'border-b-4 border-green-500 bg-green-50 dark:bg-green-900/20 animate-pulse' : ''} ${isDragging && draggedIndex !== `sub-${subRow.id}` ? 'hover:bg-green-100 dark:hover:bg-green-800/30' : ''}`"
                :draggable="!isSnapshotMode"
                @dragstart="handlePocketDragStart($event, subRow, row.id)"
                @dragover="handlePocketDragOver($event, subRow, row.id)"
                @dragleave="handleDragLeave($event)"
                @drop="handlePocketDrop($event, subRow, row.id)"
                @dragenter.prevent
                @touchstart="handlePocketTouchStart($event, subRow, row.id)"
                @touchmove="handlePocketTouchMove($event, subRow, row.id)"
                @touchend="handlePocketTouchEnd($event, subRow, row.id)"
                style="touch-action: pan-y;")
                td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default")
                  a(
                    v-if="!isSnapshotMode"
                    :aria-label="`Drag to reorder ${subRow.name}`"
                    role="button"
                    class="cursor-grab drag-handle transition-all duration-200 hover:scale-110 frog-link active:cursor-grabbing touch-manipulation p-1 sm:p-0")
                    UIcon(name="i-lucide-grip-vertical" class="frog-text-muted text-lg sm:text-base")
                td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap border-b border-default")
                  div(class="flex items-center")
                    div(class="w-4 h-4 mr-2 flex items-center justify-center frog-status-positive" aria-hidden="true")
                      UIcon(name="i-lucide-corner-down-right" class="text-xs")
                    span {{ getAccountTypeLabel(subRow.typeId, listStore.getAccountTypes) }}
                td(class="min-w-0 p-2 sm:p-4 text-xs sm:text-sm text-muted border-b border-default")
                  div(@click.prevent="handleTableClick(subRow)" role="button" tabindex="0" @keydown.enter.prevent="handleTableClick(subRow)" class="cursor-pointer font-semibold flex items-center min-w-0 frog-text")
                    div(class="w-4 h-4 mr-2 shrink-0 flex items-center justify-center frog-status-positive" aria-hidden="true")
                      UIcon(name="i-lucide-corner-down-right" class="text-xs")
                    span(class="truncate min-w-0") {{ subRow.name }}
                template(v-for="dcn in [subRowDcn(subRow)]" :key="`sub-dcn-${subRow.id}`")
                  td(v-if="showDebitCreditColumns" class="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap text-right border-b border-default")
                    DollarFormat(:amount="dcn.debit != null ? -Math.abs(dcn.debit) : null")
                  td(v-if="showDebitCreditColumns" class="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap text-right border-b border-default")
                    DollarFormat(:amount="dcn.credit")
                  td(class="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap text-right border-b border-default")
                    DollarFormat(:amount="dcn.net")

</template>

<style scoped>
.accounts-table-outer {
  padding: 0;
}

.accounts-table-controls-th {
  vertical-align: top;
  line-height: 0;
}

.accounts-table-controls-th .accounts-sticky-head {
  line-height: normal;
}

.accounts-main-table thead.accounts-sticky-thead .accounts-thead-sticky-th {
  position: sticky;
  top: var(--ui-header-height);
}

.accounts-main-table tbody tr:last-child td:first-child {
  border-bottom-left-radius: 0.375rem;
}

.accounts-main-table tbody tr:last-child td:last-child {
  border-bottom-right-radius: 0.375rem;
}

.accounts-main-table tbody tr:last-child td:only-child {
  border-bottom-left-radius: 0.375rem;
  border-bottom-right-radius: 0.375rem;
}

/* Same percentages as <colgroup>: narrow handle, wider type, name takes remainder, equal debit/credit/balance. */
.accounts-inner-head-grid--6 {
  display: grid;
  grid-template-columns: 5% 14% 42% 13% 13% 13%;
  width: 100%;
}

.accounts-inner-head-grid--4 {
  display: grid;
  grid-template-columns: 5% 14% 56% 25%;
  width: 100%;
}

.accounts-main-table col:nth-child(1) {
  min-width: 1.75rem;
}

.accounts-main-table col:nth-child(2) {
  min-width: 4rem;
}

.accounts-main-table col:nth-child(3) {
  min-width: 6rem;
}

.accounts-main-table col:nth-child(4),
.accounts-main-table col:nth-child(5),
.accounts-main-table col:nth-child(6) {
  min-width: 4rem;
}

@media (max-width: 767px) {
  .accounts-table-outer {
    overflow-x: auto;
    overflow-y: clip;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
  }

  .accounts-table-outer .accounts-main-table {
    min-width: max(100%, 36rem);
  }
}
</style>
