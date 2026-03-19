<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AccountRegister } from "~/types/types";
import { useListStore } from "../stores/listStore";
import { getAccountTypeLabel } from "~/lib/utils";
import type { ModelAccountRegisterProps } from "~/components/modals/EditAccountRegister.vue";

const ModalsEditAccountRegister = defineAsyncComponent(
  () => import("~/components/modals/EditAccountRegister.vue"),
);

const ModalsManageCategories = defineAsyncComponent(
  () => import("~/components/modals/ManageCategories.vue"),
);

definePageMeta({
  middleware: "auth",
});

// Drag and drop functions (defined early to ensure availability)
function handleDragStart(event: DragEvent, index: number) {
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
    const draggedParent = draggableAccountRegisters.value[draggedIndex.value];
    if (!draggedParent.subAccountRegisterId) {
      const targetParent = draggableAccountRegisters.value[newIndex];
      if (!targetParent.subAccountRegisterId) {
        dragOverIndex.value = newIndex;
      }
    } else {
      dragOverIndex.value = newIndex;
    }
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

function handlePocketDragLeave(event: DragEvent) {
  const target = event.target as HTMLElement;
  const relatedTarget = event.relatedTarget as HTMLElement;

  if (!target.contains(relatedTarget)) {
    dragOverIndex.value = null;
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
  const draggedPocketId = parseInt(String(draggedIndex.value).replace("sub-", ""));

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
      const draggedPocketId = parseInt(String(draggedIndex.value).replace("sub-", ""));
      const dropPocketId = parseInt(String(dragOverIndex.value).replace("sub-", ""));

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
    // Check if we're dragging a parent account
    const draggedParent = draggableAccountRegisters.value[draggedIndex.value];

    // If dragging a parent, only allow dropping on other parent accounts
    if (!draggedParent.subAccountRegisterId) {
      const targetParent = draggableAccountRegisters.value[index];

      // Only show drop zone if target is also a parent account
      if (!targetParent.subAccountRegisterId) {
        dragOverIndex.value = index;
      }
    } else {
      // If dragging a pocket account, allow normal pocket-to-pocket dropping
      dragOverIndex.value = index;
    }
  }
}

function handleDragLeave(event: DragEvent) {
  // Only clear if we're leaving the drop zone entirely
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
const { today } = useToday();
const showShortcuts = ref(false);

// const stripedTheme = ref({
//   tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
// });

const modal = overlay.create(ModalsEditAccountRegister);
const categoriesModal = overlay.create(ModalsManageCategories);

function handleTableClick(data: AccountRegister) {
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
          onClick: () => handleTableClick(row.original),
        },
        row.getValue("name"),
      ),
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

function handleAddAccountRegister() {
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
      statementAt: today.value,
      statementIntervalId: 0,
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
  const accountId =
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

/** Debit / credit / net for accounts table (linked loan+asset or standalone). */
function registerDebitCreditNet(
  row: AccountRegister,
  isSubRow: boolean,
): { debit: number | null; credit: number | null; net: number | null } {
  if (isSubRow) {
    const b = +row.balance;
    if (b < 0) {
      return { debit: Math.abs(b), credit: null, net: b };
    }
    return { debit: null, credit: b, net: b };
  }
  const registers = listStore.getAccountRegisters;
  const linkedLoan = registers.find(
    (r) =>
      !r.subAccountRegisterId &&
      r.collateralAssetRegisterId === row.id &&
      r.id !== row.id,
  );
  if (linkedLoan && !isCreditRegister(row)) {
    const assetBal = +row.balance;
    const loanBalAbs = Math.abs(+linkedLoan.balance);
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
      const assetBal = +asset.balance;
      const loanBalAbs = Math.abs(+row.balance);
      return {
        debit: loanBalAbs,
        credit: assetBal,
        net: assetBal - loanBalAbs,
      };
    }
  }
  if (isCreditRegister(row)) {
    const b = +row.balance;
    return {
      debit: Math.abs(b),
      credit: null,
      net: -Math.abs(b),
    };
  }
  return {
    debit: null,
    credit: +row.balance,
    net: +row.balance,
  };
}

// Drag and drop functionality
const { $api } = useNuxtApp();
const toast = useToast();

// Drag and drop state
const draggedIndex = ref<number | string | null>(null);
const isDragging = ref(false);
const dragOverIndex = ref<number | string | null>(null);

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
const activeSortMode = ref<"visual" | "loan" | "savings">("visual");

const showCrossAccountSnapshot = ref(false);

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
        activeSortMode.value = item.key as "visual" | "loan" | "savings";
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
    const response = await $api("/api/account-register-sort", {
      method: "POST",
      body: {
        accountRegisters: newOrder,
        sortMode: activeSortMode.value as "visual" | "loan" | "savings",
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
    const response = await $api("/api/account-register-sort", {
      method: "POST",
      body: {
        accountRegisters: updatedPockets,
        sortMode: activeSortMode.value as "visual" | "loan" | "savings",
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

defineShortcuts({
  escape: {
    usingInput: true,
    handler: () => {
      globalFilter.value = "";
    },
  },
  meta_a: () => handleAddAccountRegister(),
  meta_f: () => {
    const search = document.getElementById("search");

    if (search) {
      search.focus();
    }
  },
});

const globalFilter = ref("");
const accountRegistersSectionEl = ref<HTMLElement | null>(null);
const accountRegistersTableViewportEl = ref<HTMLElement | null>(null);
const accountRegistersViewportMaxHeight = ref(
  "calc(100dvh - var(--ui-header-height) - 12rem)",
);
let accountRegistersResizeObserver: ResizeObserver | null = null;
let accountRegistersViewportFrameId: number | null = null;

function updateAccountRegistersViewportMaxHeight() {
  if (!accountRegistersTableViewportEl.value) return;

  if (accountRegistersViewportFrameId != null) {
    cancelAnimationFrame(accountRegistersViewportFrameId);
  }

  accountRegistersViewportFrameId = requestAnimationFrame(() => {
    const tableTop =
      accountRegistersTableViewportEl.value?.getBoundingClientRect().top ?? 0;
    const bottomSpacing = 16;
    const available = Math.max(
      220,
      Math.floor(window.innerHeight - tableTop - bottomSpacing),
    );
    accountRegistersViewportMaxHeight.value = `${available}px`;
  });
}

const filteredAccountRegisters = computed(() => {
  const filterText = globalFilter.value.toLowerCase();
  const filtered = listStore.getAccountRegisters.filter((f) => {
    const matchesFilter =
      !filterText || f.name.toLowerCase().includes(filterText);
    return matchesFilter && !f.subAccountRegisterId;
  });
  return sortAccounts(filtered);
});

function mainRowDcn(row: AccountRegister) {
  return registerDebitCreditNet(row, false);
}

function subRowDcn(subRow: AccountRegister) {
  return registerDebitCreditNet(subRow, true);
}

/** True when at least one account has a linked asset (loan+asset pair exists). */
const showDebitCreditColumns = computed(() =>
  listStore.getAccountRegisters.some(
    (r) =>
      r.collateralAssetRegisterId != null && r.collateralAssetRegisterId > 0,
  ),
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
  return listStore.getAccountRegisters.reduce((acc, curr) => {
    if (curr.typeId !== 15) {
      acc += +curr.balance;
    }

    return acc;
  }, 0);
});

/** Main registers only: lowest computed balance + risk signal for cross-account snapshot */
const accountLiquiditySnapshot = computed(() => {
  const mains = listStore.getAccountRegisters.filter(
    (r) => !r.subAccountRegisterId,
  );
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
  if (route.query.onboarding === "1") {
    toast.add({
      color: "success",
      description: "Welcome! Add your first account to start forecasting.",
    });
  }

  await nextTick();
  updateAccountRegistersViewportMaxHeight();
  window.addEventListener("resize", updateAccountRegistersViewportMaxHeight);

  accountRegistersResizeObserver = new ResizeObserver(() => {
    updateAccountRegistersViewportMaxHeight();
  });

  if (accountRegistersSectionEl.value) {
    accountRegistersResizeObserver.observe(accountRegistersSectionEl.value);
  }
});

onBeforeUnmount(() => {
  if (longPressTimer.value != null) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }

  window.removeEventListener("resize", updateAccountRegistersViewportMaxHeight);
  if (accountRegistersResizeObserver) {
    accountRegistersResizeObserver.disconnect();
    accountRegistersResizeObserver = null;
  }
  if (accountRegistersViewportFrameId != null) {
    cancelAnimationFrame(accountRegistersViewportFrameId);
    accountRegistersViewportFrameId = null;
  }
});
</script>

<template lang="pug">
  section(ref="accountRegistersSectionEl" class="m-4")
    div(class="w-full flex flex-wrap items-center gap-2 mb-4")
      RegisterListToolbar(
        v-model:global-filter="globalFilter"
        v-model:show-shortcuts="showShortcuts"
        :show-refresh="false"
        filter-class="w-full md:max-w-48"
        @add="handleAddAccountRegister"
      )
        template(#middle)
          UButton(
            variant="soft"
            size="sm"
            :disabled="!listStore.getAccountRegisters[0]?.accountId && !listStore.getAccounts?.[0]?.id"
            @click="handleManageCategories"
          ) Manage Categories
          UDropdownMenu(:items="sortMenuItems")
            UButton(variant="soft" size="sm") Sort
        template(#trailing)
          .ml-auto(
            class="text-muted text-right cursor-pointer select-none hover:opacity-80 transition-opacity text-sm shrink-0"
            role="button"
            tabindex="0"
            @click="showCrossAccountSnapshot = !showCrossAccountSnapshot"
            @keydown.enter.prevent="showCrossAccountSnapshot = !showCrossAccountSnapshot"
            @keydown.space.prevent="showCrossAccountSnapshot = !showCrossAccountSnapshot"
          )
            span Your estimated net worth
            b.text-nowrap &nbsp;{{ formatCurrency(estimatedNetWorth) }}&nbsp;

    UCard(v-if="showShortcuts" class="my-4")
      template(#header)
        h3(class="font-semibold") Keyboard shortcuts
      ul(class="space-y-2 text-sm")
        li Clear filter: ⎋
        li Add account: ⌘ + A
        li Focus filter: ⌘ + F

    UCard(v-if="draggableAccountRegisters.length === 0" class="my-4")
      template(#header)
        h3(class="font-semibold") Create your first account
      p(class="frog-text-muted mb-4") Start with an account and opening balance, then add recurring items to improve your forecast.
      ol(class="list-decimal ml-4 mb-4 text-sm space-y-1")
        li Add an account register
        li Set an opening balance
        li Add recurring entries for upcoming cash flow
      UButton(color="primary" size="sm" @click="handleAddAccountRegister") Add first account

    UCard(v-if="showCrossAccountSnapshot && accountLiquiditySnapshot && draggableAccountRegisters.length > 0" class="my-4")
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

    div(v-if="draggableAccountRegisters.length > 0" ref="accountRegistersTableViewportEl" class="relative overflow-auto flex-1 w-full" :style="{ maxHeight: accountRegistersViewportMaxHeight }")
      table(class="w-full min-w-full text-xs sm:text-sm")
        thead(class="[&>tr]:after:absolute [&>tr]:after:inset-x-0 [&>tr]:after:bottom-0 [&>tr]:after:h-px [&>tr]:after:bg-(--ui-border-accented) sticky top-0 inset-x-0 bg-(--ui-bg)/75 z-1 backdrop-blur w-full")
          tr(class="data-[selected=true]:bg-(--ui-bg-elevated)/50 frog-surface-elevated")
            th(class="px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-left rtl:text-right font-semibold w-12 sm:w-16")
            th(class="px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-left rtl:text-right font-semibold w-1/5") Type
            th(class="px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-left rtl:text-right font-semibold") Account Name
            th(v-if="showDebitCreditColumns" class="px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-right font-semibold whitespace-nowrap") Debit
            th(v-if="showDebitCreditColumns" class="px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-right font-semibold whitespace-nowrap") Credit
            th(class="px-2 sm:px-4 py-2 sm:py-3.5 text-xs sm:text-sm text-highlighted text-right font-semibold whitespace-nowrap") Balance

        tbody(class="w-full relative")
          // Drop zone indicator when dragging
          tr(v-if="isDragging" class="h-2 bg-primary/20 border-2 border-dashed border-primary/60 transition-all duration-200")
            td(:colspan="showDebitCreditColumns ? 6 : 4" class="p-0")
              div(class="h-2 bg-linear-to-r from-(--frog-primary) to-(--frog-accent) animate-pulse")

          // Main accounts with their sub-accounts grouped together
          template(v-for="(row, index) in draggableAccountRegisters" :key="`main-${row.id}`")
            // Main account row (draggable)
            tr(
              :class="`odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700 transition-all duration-200 ease-in-out ${isDragging && draggedIndex === index ? 'opacity-30 scale-95 transform rotate-1 shadow-lg bg-yellow-50 dark:bg-yellow-900/20' : ''} ${isDragging && draggedPocketGroup && draggedPocketGroup.parentId === row.id ? 'bg-yellow-50 dark:bg-yellow-900/20 border-t-2 border-l-2 border-r-2 border-yellow-400 dark:border-yellow-600' : ''} ${dragOverIndex === index && isDragging ? 'border-t-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 animate-pulse' : ''} ${dragOverIndex === index + 1 && isDragging ? 'border-b-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 animate-pulse' : ''} ${isDragging && draggedIndex !== index ? 'hover:bg-blue-100 dark:hover:bg-blue-800/30' : ''}`"
              draggable="true"
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
              td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap w-12 sm:w-16")
                a(class="cursor-grab drag-handle transition-all duration-200 hover:scale-110 frog-link active:cursor-grabbing touch-manipulation p-1 sm:p-0")
                  UIcon(name="i-lucide-grip-vertical" class="frog-text-muted text-lg sm:text-base")
                  //- span(class="hidden sm:inline text-xs text-gray-500 ml-1") Drag
              td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap w-1/5") {{ getAccountTypeLabel(row.typeId, listStore.getAccountTypes) }}
              td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap")
                div(class="flex items-center")
                  div(
                    v-if="listStore.getAccountRegisters.filter(f => f.subAccountRegisterId === row.id).length > 0"
                    @click="togglePocketAccounts(row.id)"
                    class="cursor-pointer mr-2 transition-transform duration-200 hover:scale-110"
                    :class="collapsedParents.has(row.id) ? 'rotate-0' : 'rotate-90'"
                  )
                    UIcon(name="i-lucide-chevron-right" class="frog-text-muted text-sm")
                  div(@click.prevent="handleTableClick(row)" class="cursor-pointer font-semibold frog-text") {{ row.name }}
              template(v-for="dcn in [mainRowDcn(row)]" :key="`dcn-${row.id}`")
                td(v-if="showDebitCreditColumns" class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap")
                  span(v-if="dcn.debit != null" class="dark:text-red-300 text-red-700") −${{ formatCurrency(dcn.debit).replace(/^\$/, '') }}
                  span(v-else class="frog-text-muted") —
                td(v-if="showDebitCreditColumns" class="p-2 sm:p-4 text-xs sm:text-sm text-right whitespace-nowrap")
                  span(v-if="dcn.credit != null" class="dark:text-green-300 text-green-700") +${{ formatCurrency(dcn.credit).replace(/^\$/, '') }}
                  span(v-else class="frog-text-muted") —
                td(class="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap text-right")
                  span(v-if="dcn.net != null" :class="dcn.net >= 0 ? 'dark:text-green-300 text-green-700' : 'dark:text-red-300 text-red-700'") {{ dcn.net >= 0 ? '+' : '−' }}${{ formatCurrency(Math.abs(dcn.net)).replace(/^\$/, '') }}
                  span(v-else class="frog-text-muted") —

            // Sub-accounts for this main account (draggable pocket accounts)
            template(v-if="!row.subAccountRegisterId && !collapsedParents.has(row.id)")
              tr(
                v-for="(subRow, subIndex) in listStore.getAccountRegisters.filter(f => f.subAccountRegisterId === row.id).sort((a, b) => getSortField(a) - getSortField(b))"
                :key="`sub-${subRow.id}`"
                :class="`odd:bg-gray-200 even:bg-gray-150 dark:odd:bg-gray-600 dark:even:bg-gray-500 transition-all duration-200 ease-in-out border-l-2 border-green-200 dark:border-green-700/50 ${isDragging && draggedIndex === `sub-${subRow.id}` ? 'opacity-30 scale-95 transform rotate-1 shadow-lg bg-green-50 dark:bg-green-900/20 border-2 border-green-400 dark:border-green-600' : ''} ${isDragging && draggedPocketGroup && draggedPocketGroup.parentId === row.id ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-r-2 border-yellow-400 dark:border-yellow-600' : ''} ${isDragging && draggedPocketGroup && draggedPocketGroup.parentId === row.id && subIndex === listStore.getAccountRegisters.filter(f => f.subAccountRegisterId === row.id).length - 1 ? 'border-b-2 border-yellow-400 dark:border-yellow-600' : ''} ${dragOverIndex === `sub-${subRow.id}` && isDragging ? 'border-t-4 border-green-500 bg-green-50 dark:bg-green-900/20 animate-pulse' : ''} ${dragOverIndex === `sub-${subRow.id}-next` && isDragging ? 'border-b-4 border-green-500 bg-green-50 dark:bg-green-900/20 animate-pulse' : ''} ${isDragging && draggedIndex !== `sub-${subRow.id}` ? 'hover:bg-green-100 dark:hover:bg-green-800/30' : ''}`"
                draggable="true"
                @dragstart="handlePocketDragStart($event, subRow, row.id)"
                @dragover="handlePocketDragOver($event, subRow, row.id)"
                @dragleave="handlePocketDragLeave($event)"
                @drop="handlePocketDrop($event, subRow, row.id)"
                @dragenter.prevent
                @touchstart="handlePocketTouchStart($event, subRow, row.id)"
                @touchmove="handlePocketTouchMove($event, subRow, row.id)"
                @touchend="handlePocketTouchEnd($event, subRow, row.id)"
                style="touch-action: pan-y;")
                td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap w-12 sm:w-16")
                  a(class="cursor-grab drag-handle transition-all duration-200 hover:scale-110 frog-link active:cursor-grabbing touch-manipulation p-1 sm:p-0")
                    UIcon(name="i-lucide-grip-vertical" class="frog-text-muted text-lg sm:text-base")
                td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap w-1/5")
                  div(class="flex items-center")
                    div(class="w-4 h-4 mr-2 flex items-center justify-center frog-status-positive")
                      UIcon(name="i-lucide-corner-down-right" class="text-xs")
                    span {{ getAccountTypeLabel(subRow.typeId, listStore.getAccountTypes) }}
                td(class="p-2 sm:p-4 text-xs sm:text-sm text-muted whitespace-nowrap")
                  div(@click.prevent="handleTableClick(subRow)" class="cursor-pointer font-semibold flex items-center frog-text")
                    div(class="w-4 h-4 mr-2 flex items-center justify-center frog-status-positive")
                      UIcon(name="i-lucide-corner-down-right" class="text-xs")
                    span {{ subRow.name }}
                template(v-for="dcn in [subRowDcn(subRow)]" :key="`sub-dcn-${subRow.id}`")
                  td(v-if="showDebitCreditColumns" class="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap text-right")
                    span(v-if="dcn.debit != null" class="dark:text-red-300 text-red-700") −${{ formatCurrency(dcn.debit).replace(/^\$/, '') }}
                    span(v-else class="frog-text-muted") —
                  td(v-if="showDebitCreditColumns" class="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap text-right")
                    span(v-if="dcn.credit != null" class="dark:text-green-300 text-green-700") +${{ formatCurrency(dcn.credit).replace(/^\$/, '') }}
                    span(v-else class="frog-text-muted") —
                  td(class="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap text-right")
                    span(v-if="dcn.net != null" :class="dcn.net >= 0 ? 'dark:text-green-300 text-green-700' : 'dark:text-red-300 text-red-700'") {{ dcn.net >= 0 ? '+' : '−' }}${{ formatCurrency(Math.abs(dcn.net)).replace(/^\$/, '') }}
                    span(v-else class="frog-text-muted") —
</template>
