<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";

import { ModalsEditReoccurrence } from "#components";
import {
  formatDate,
  getAccountRegisterLabel,
  getIntervalLabel,
} from "~/lib/utils";
import type { Reoccurrence } from "~/types/types";
import type { ModalReoccurrenceProps } from "~/components/modals/EditReoccurrence.vue";

definePageMeta({
  middleware: "auth",
});

const listStore = useListStore();

const stripedTheme = ref({
  tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
});

const overlay = useOverlay();
const modal = overlay.create(ModalsEditReoccurrence);
const { todayISOString } = useToday();

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
      intervalId: 0,
      accountRegisterId: 0,
      lastAt: todayISOString.value || "",
      endAt: undefined,
      intervalCount: 0,
      adjustBeforeIfOnWeekend: false,
    },
  };
  const modal = overlay.create(ModalsEditReoccurrence);
  modal.open(addReoccurrence);
}

async function handleRecalculate() {
  if (isRecalculating.value) return; // Prevent multiple simultaneous calls

  isRecalculating.value = true;
  try {
    const { data } = await useAPI<{ success: boolean; entriesCalculated: number; entriesBalance: number; accountRegisters: number }>(() => "/api/recalculate", {
      method: "POST",
      body: {
        accountId: listStore.getAccounts?.[0]?.id,
      },
    });

    if (data.value?.success) {
      // Refresh the lists after recalculation
      await listStore.fetchLists();
    }
  } catch (error) {
    console.error("Recalculation failed:", error);
  } finally {
    isRecalculating.value = false;
  }
}

defineShortcuts({
  escape: {
    usingInput: true,
    handler: () => {
      globalFilter.value = "";
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
    header: () => h("div", { class: "text-right" }, "Next Occurrence"),
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
const isRecalculating = ref(false);
</script>

<template lang="pug">
  section(class="m-4")
    div(class="w-full flex mb-6")
      UButton(color="info" size="sm" class="mr-4" @click="handleAddReoccurrence") Add
      UButton(color="warning" size="sm" class="mr-4" @click="handleRecalculate" :loading="isRecalculating" :disabled="isRecalculating") {{ isRecalculating ? 'Recalculating...' : 'Recalc' }}
      UInput(v-model="globalFilter" size="sm" class="w-full md:max-w-48" placeholder="Filter..." id="search")

    UTable(
      class="flex-1 max-h-[calc(100vh-270px)]"
      v-model:global-filter="globalFilter"
      :data="listStore.getReoccurrences"
      :columns="columns"
      sticky
      :ui="stripedTheme"
      :loading="listStore.getIsListsLoading"
      loading-color="primary"
      loading-animation="carousel")
</template>
