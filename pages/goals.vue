<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SavingsGoal } from "~/types/types";
import type { EditSavingsGoalProps } from "~/components/modals/EditSavingsGoal.vue";
import { getAccountRegisterLabel } from "~/lib/utils";

const ModalsEditSavingsGoal = defineAsyncComponent(
  () => import("~/components/modals/EditSavingsGoal.vue"),
);

definePageMeta({
  middleware: "auth",
});

const listStore = useListStore();
const overlay = useOverlay();
const modal = overlay.create(ModalsEditSavingsGoal);
const globalFilter = ref("");

const tableUi = ref({
  root: "!overflow-visible relative min-h-0",
  base: "!overflow-visible min-w-full",
  thead: "!z-30",
  tr: "odd:bg-gray-100 even:bg-white dark:odd:bg-gray-800 dark:even:bg-gray-700",
});

const registers = computed(() => listStore.getAccountRegisters);

function handleTableClick(goal: SavingsGoal) {
  const props: EditSavingsGoalProps = {
    goal,
    callback: (updated) => {
      listStore.patchSavingsGoal(updated);
      listStore.fetchLists();
      modal.close();
    },
    cancel: () => modal.close(),
  };
  modal.open(props);
}

function handleAddGoal() {
  const first = listStore.getAccountRegisters[0];
  const props: EditSavingsGoalProps = {
    goal: null,
    callback: () => {
      listStore.fetchLists();
      modal.close();
    },
    cancel: () => modal.close(),
  };
  modal.open(props);
}

const columns: TableColumn<SavingsGoal>[] = [
  {
    accessorKey: "name",
    header: () => h("div", {}, "Name"),
    cell: ({ row }) =>
      h(
        "div",
        {
          class: "cursor-pointer font-semibold text-white",
          onClick: () => handleTableClick(row.original),
        },
        row.getValue("name"),
      ),
  },
  {
    accessorKey: "targetAmount",
    header: () => h("div", { class: "text-right" }, "Target"),
    cell: ({ row }) =>
      h(
        "div",
        { class: "text-right" },
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(row.getValue("targetAmount")),
      ),
  },
  {
    accessorKey: "sourceAccountRegisterId",
    header: () => h("div", {}, "Source"),
    cell: ({ row }) =>
      getAccountRegisterLabel(
        row.getValue("sourceAccountRegisterId"),
        registers.value,
      ),
  },
  {
    accessorKey: "targetAccountRegisterId",
    header: () => h("div", {}, "Pocket"),
    cell: ({ row }) =>
      getAccountRegisterLabel(
        row.getValue("targetAccountRegisterId"),
        registers.value,
      ),
  },
  {
    accessorKey: "priorityOverDebt",
    header: () => h("div", {}, "Over debt"),
    cell: ({ row }) =>
      h("div", {}, row.getValue("priorityOverDebt") ? "Yes" : "No"),
  },
  {
    accessorKey: "ignoreMinBalance",
    header: () => h("div", {}, "Ignore min"),
    cell: ({ row }) =>
      h("div", {}, row.getValue("ignoreMinBalance") ? "Yes" : "No"),
  },
];

defineShortcuts({
  escape: () => { globalFilter.value = ""; },
  meta_a: () => handleAddGoal(),
});

const sectionEl = ref<HTMLElement | null>(null);
const tableHostEl = ref<HTMLElement | null>(null);
const tableViewportMaxHeight = ref(
  "calc(100dvh - var(--ui-header-height) - 12rem)",
);

function updateTableViewportMaxHeight() {
  if (!tableHostEl.value) return;
  const tableTop = tableHostEl.value?.getBoundingClientRect().top ?? 0;
  const bottomSpacing = 16;
  const available = Math.max(
    220,
    Math.floor(window.innerHeight - tableTop - bottomSpacing),
  );
  tableViewportMaxHeight.value = `${available}px`;
}

onMounted(() => {
  window.addEventListener("resize", updateTableViewportMaxHeight);
  nextTick(updateTableViewportMaxHeight);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateTableViewportMaxHeight);
});
</script>

<template>
  <section ref="sectionEl" class="m-4">
    <div class="w-full min-w-0 flex flex-wrap gap-1 items-center mb-6">
      <UTooltip text="Add goal" :delay-duration="150">
        <UButton
          color="primary"
          size="sm"
          square
          icon="i-lucide-plus"
          aria-label="Add goal"
          @click="handleAddGoal"
        />
      </UTooltip>
      <UInput
        v-model="globalFilter"
        placeholder="Filter goals..."
        icon="i-lucide-search"
        class="max-w-xs"
      />
    </div>

    <UCard
      v-if="listStore.getSavingsGoalsForCurrentBudget.length === 0 && !listStore.getIsListsLoading"
      class="mb-4"
    >
      <template #header>
        <h3 class="font-semibold">No goals yet</h3>
      </template>
      <p class="frog-text-muted mb-4">
        Add savings goals (e.g. boat, house down payment) and set whether they fund before or after extra debt payments.
      </p>
      <UButton color="primary" size="sm" @click="handleAddGoal">
        Add first goal
      </UButton>
    </UCard>

    <div
      v-if="listStore.getSavingsGoalsForCurrentBudget.length > 0 || listStore.getIsListsLoading"
      ref="tableHostEl"
      class="flex-1 min-h-0 overflow-auto"
      :style="{ maxHeight: tableViewportMaxHeight }"
    >
      <UTable
        v-model:global-filter="globalFilter"
        :data="listStore.getSavingsGoalsForCurrentBudget"
        :columns="columns"
        sticky
        :ui="tableUi"
        :loading="listStore.getIsListsLoading"
        loading-color="primary"
        loading-animation="carousel"
      />
    </div>
  </section>
</template>
