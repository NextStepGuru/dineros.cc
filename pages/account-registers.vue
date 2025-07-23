<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AccountRegister } from "~/types/types";
import { useListStore } from "../stores/listStore";
import { getAccountTypeLabel } from "~/lib/utils";
import { ModalsEditAccountRegister } from "#components";
import type { ModelAccountRegisterProps } from "~/components/modals/EditAccountRegister.vue";
import VueDraggable from "vuedraggable";

definePageMeta({
  middleware: "auth",
});

// Drag and drop functions (defined early to ensure availability)
function handleDragStart(event: DragEvent, index: number) {
  draggedIndex.value = index;
  isDragging.value = true;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleDragOver(event: DragEvent, index: number) {
  event.preventDefault();
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    dragOverIndex.value = index;
  }
}

function handleDragLeave(event: DragEvent) {
  dragOverIndex.value = null;
}

function handleDrop(event: DragEvent, dropIndex: number) {
  if (draggedIndex.value === null || draggedIndex.value === dropIndex) {
    return;
  }

  const items = [...draggableAccountRegisters.value];
  const draggedItem = items[draggedIndex.value];

  // Remove the dragged item
  items.splice(draggedIndex.value, 1);

  // Insert at the new position
  items.splice(dropIndex, 0, draggedItem);

  // Update the array with new sort orders
  const updatedItems = items.map((item, index) => ({
    ...item,
    sortOrder: index,
  }));

  draggableAccountRegisters.value = updatedItems;

  // Call the API to persist the change
  handleDragEnd({ oldIndex: draggedIndex.value, newIndex: dropIndex });

  draggedIndex.value = null;
  isDragging.value = false;
  dragOverIndex.value = null;
}

const overlay = useOverlay();

const listStore = useListStore();
const authStore = useAuthStore();

// const stripedTheme = ref({
//   tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
// });

const modal = overlay.create(ModalsEditAccountRegister);

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
        row.getValue("name")
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
        }).format(row.getValue("balance"))
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
      accountId: listStore.getAccounts?.[0]?.id,
      name: "",
      typeId: 0,
      balance: 0,
      latestBalance: 0,
      minPayment: null,
      statementAt: new Date(),
      apr1: null,
      apr1StartAt: null,
      apr2: null,
      apr2StartAt: null,
      apr3: null,
      apr3StartAt: null,
      targetAccountRegisterId: null,
      loanStartAt: null,
      loanPaymentsPerYear: null,
      loanTotalYears: null,
      loanOriginalAmount: null,
      sortOrder: 0,
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

function formatCurrencyClass(balance: number): string {
  return `text-right ${+balance < 0 ? "dark:text-red-300 text-red-700" : ""}`;
}

function formatCurrency(balance: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(balance);
}

// Drag and drop functionality
const { $api } = useNuxtApp();
const toast = useToast();

// Drag and drop state
const draggedIndex = ref<number | null>(null);
const isDragging = ref(false);
const dragOverIndex = ref<number | null>(null);

async function handleDragEnd(event: any) {
  // Check if the item was actually moved (not just clicked)
  if (event.oldIndex === event.newIndex) {
    console.log("No change detected, returning");
    return;
  }

  const newOrder = draggableAccountRegisters.value.map(
    (item: AccountRegister, index: number) => ({
      ...item,
      sortOrder: index,
    })
  );

  try {
    const response = await $api("/api/account-register-sort", {
      method: "POST",
      body: {
        accountRegisters: newOrder,
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

const filteredAccountRegisters = computed(() => {
  const filterText = globalFilter.value.toLowerCase();
  return listStore.getAccountRegisters.filter((f) => {
    const matchesFilter =
      !filterText || f.name.toLowerCase().includes(filterText);
    return matchesFilter && !f.subAccountRegisterId;
  });
});

// Only main accounts for draggable (no sub-accounts)
const draggableAccountRegisters = ref<AccountRegister[]>([]);

// Watch for changes in filteredAccountRegisters and update draggableAccountRegisters
watch(
  filteredAccountRegisters,
  (newValue) => {
    draggableAccountRegisters.value = [...newValue];
  },
  { immediate: true }
);

const estimatedNetWorth = computed(() => {
  return listStore.getAccountRegisters.reduce((acc, curr) => {
    if (curr.typeId !== 15) {
      acc += curr.balance;
    }

    return acc;
  }, 0);
});
</script>

<template lang="pug">
  section(class="m-4")
    div(class="w-full flex")
      UButton(color="info" size="sm" class="mr-4" @click="handleAddAccountRegister") Add
      UInput(v-model="globalFilter" size="sm" class="w-full md:max-w-48" placeholder="Filter..." id="search" ref="search")

    .w-full(class="text-[var(--ui-text-muted)] text-right")
      span Your estimated net worth
      b.text-nowrap &nbsp;{{ formatCurrency(estimatedNetWorth) }}&nbsp;
    div(class="relative overflow-auto flex-1 max-h-[calc(100vh-270px)] w-full")
      table(class="w-full min-w-full")
        thead(class="[&>tr]:after:absolute [&>tr]:after:inset-x-0 [&>tr]:after:bottom-0 [&>tr]:after:h-px [&>tr]:after:bg-[var(--ui-border-accented)] sticky top-0 inset-x-0 bg-[var(--ui-bg)]/75 z-[1] backdrop-blur w-full")
          tr(class="data-[selected=true]:bg-[var(--ui-bg-elevated)]/50 odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700")
            th(class="px-4 py-3.5 text-sm text-[var(--ui-text-highlighted)] text-left rtl:text-right font-semibold w-16")
            th(class="px-4 py-3.5 text-sm text-[var(--ui-text-highlighted)] text-left rtl:text-right font-semibold w-1/5") Type
            th(class="px-4 py-3.5 text-sm text-[var(--ui-text-highlighted)] text-left rtl:text-right font-semibold") Account Name
            th(class="px-4 py-3.5 text-sm text-[var(--ui-text-highlighted)] text-right font-semibold w-1/5") Balance

        tbody(class="w-full")
          // Main accounts with their sub-accounts grouped together
          template(v-for="(row, index) in draggableAccountRegisters" :key="`main-${row.id}`")
            // Main account row (draggable)
            tr(
              :class="`odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700 ${isDragging && draggedIndex === index ? 'opacity-50' : ''} ${dragOverIndex === index && isDragging ? 'border-t-2 border-blue-500' : ''} ${dragOverIndex === index + 1 && isDragging ? 'border-b-2 border-blue-500' : ''}`"
              draggable="true"
              @dragstart="handleDragStart($event, index)"
              @dragover="handleDragOver($event, index)"
              @dragleave="handleDragLeave($event)"
              @drop="handleDrop($event, index)"
              @dragenter.prevent
            )
              td(class="p-4 text-sm text-[var(--ui-text-muted)] whitespace-nowrap w-16")
                a(class="cursor-grab drag-handle")
                  UIcon(name="i-lucide-grip-vertical")
              td(class="p-4 text-sm text-[var(--ui-text-muted)] whitespace-nowrap w-1/5") {{ getAccountTypeLabel(row.typeId, listStore.getAccountTypes) }}
              td(class="p-4 text-sm text-[var(--ui-text-muted)] whitespace-nowrap")
                div(@click.prevent="handleTableClick(row)" class="cursor-pointer font-semibold text-white") {{ row.name }}
              td(class="p-4 text-sm text-[var(--ui-text-muted)] whitespace-nowrap w-1/5")
                div(:class="formatCurrencyClass(row.balance)") {{ formatCurrency(row.balance) }}

            // Sub-accounts for this main account (non-draggable)
            template(v-if="!row.subAccountRegisterId")
              tr(
                v-for="subRow in listStore.getAccountRegisters.filter(f => f.subAccountRegisterId === row.id)"
                :key="`sub-${subRow.id}`"
                class="odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700")
                td(class="w-16") &nbsp;
                td(class="p-4 text-sm text-[var(--ui-text-muted)] whitespace-nowrap w-1/5") &#x21b3; {{ getAccountTypeLabel(subRow.typeId, listStore.getAccountTypes) }}
                td(class="p-4 text-sm text-[var(--ui-text-muted)] whitespace-nowrap")
                  div(@click.prevent="handleTableClick(subRow)" class="cursor-pointer font-semibold text-white") &#x21b3; {{ subRow.name }}
                td(class="p-4 text-sm text-[var(--ui-text-muted)] whitespace-nowrap w-1/5")
                  div(:class="formatCurrencyClass(subRow.balance)") {{ formatCurrency(subRow.balance) }}
</template>
