<script setup lang="ts">
import type { Budget } from "~/types/types";
import { handleError } from "~/lib/utils";

export type BudgetManagerMode = "create" | "rename" | "reset" | "delete";

export type BudgetManagerProps = {
  mode: BudgetManagerMode;
  budget: Budget | null;
  callback: () => void;
  cancel: () => void;
};

const props = defineProps<BudgetManagerProps>();
const toast = useToast();
const listStore = useListStore();
const authStore = useAuthStore();
const { $api } = useNuxtApp();

const createName = ref("");
const duplicateFinancialAccount = ref(false);
const renameName = ref(props.budget?.name ?? "");
const isSubmitting = ref(false);

watch(
  () => props.budget,
  (b) => {
    renameName.value = b?.name ?? "";
  },
  { immediate: true },
);

async function handleCreate() {
  const name = createName.value?.trim();
  if (!name || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    const created = await $api<Budget>("/api/budget", {
      method: "POST",
      body: {
        name,
        duplicateFinancialAccount: duplicateFinancialAccount.value,
      },
    }).catch((err) => handleError(err, toast));
    if (created) {
      listStore.addBudget(created);
      if (duplicateFinancialAccount.value) {
        await listStore.fetchLists();
      }
      toast.add({
        color: "success",
        description: duplicateFinancialAccount.value
          ? "New financial account and budget created from your default."
          : "Budget created.",
      });
      props.callback();
    }
  } finally {
    isSubmitting.value = false;
  }
}

async function handleRename() {
  if (!props.budget || isSubmitting.value) return;
  const name = renameName.value?.trim();
  if (!name) return;
  isSubmitting.value = true;
  try {
    const updated = await $api<Budget>(`/api/budget/${props.budget.id}`, {
      method: "PATCH",
      body: { name },
    }).catch((err) => handleError(err, toast));
    if (updated) {
      listStore.updateBudget(updated);
      toast.add({ color: "success", description: "Budget renamed." });
      props.callback();
    }
  } finally {
    isSubmitting.value = false;
  }
}

async function handleReset() {
  if (!props.budget || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    await $api(`/api/budget/${props.budget.id}/reset`, {
      method: "POST",
    }).catch((err) => handleError(err, toast));
    await listStore.fetchLists();
    toast.add({ color: "success", description: "Budget reset from default." });
    props.callback();
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete() {
  if (!props.budget || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    await $api(`/api/budget/${props.budget.id}`, {
      method: "DELETE",
    }).catch((err) => handleError(err, toast));
    listStore.removeBudget(props.budget.id);
    if (authStore.getBudgetId === props.budget.id) {
      const defaultBudget = listStore.getDefaultBudget;
      if (defaultBudget) authStore.setBudgetId(defaultBudget.id);
      await listStore.fetchLists();
    }
    toast.add({ color: "success", description: "Budget archived." });
    props.callback();
  } finally {
    isSubmitting.value = false;
  }
}

const title = computed(() => {
  switch (props.mode) {
    case "create":
      return "Create budget";
    case "rename":
      return "Rename budget";
    case "reset":
      return "Reset budget";
    case "delete":
      return "Delete budget";
    default:
      return "Budget";
  }
});

const description = computed(() => {
  switch (props.mode) {
    case "create":
      return "Create a new budget by copying registers and data from your default budget. Optionally create a separate financial account (new workspace) with categories and settings migrated.";
    case "rename":
      return "Change the name of this budget.";
    case "reset":
      return "Replace all data in this budget with a fresh copy from your default budget. This cannot be undone.";
    case "delete":
      return "Archive this budget and its accounts. You can no longer use it. The default budget cannot be deleted.";
    default:
      return "";
  }
});

defineShortcuts({
  escape: () => props.cancel(),
});
</script>

<template lang="pug">
UModal(
  :title="title"
  :description="description"
  class="modal-mobile-fullscreen"
)
  template(#body)
    .space-y-4
      template(v-if="mode === 'create'")
        UFormField(label="Name")
          UInput(
            v-model="createName"
            placeholder="e.g. Vacation plan"
            maxlength="255"
          )
        UFormField(label="Financial account")
          UCheckbox(
            v-model="duplicateFinancialAccount"
            label="Create new financial account (copy categories and migrate references)"
          )
          p.text-sm.text-gray-500.mt-1
            | Uses a new account workspace; your default budget is unchanged.
      template(v-else-if="mode === 'rename' && budget")
        UFormField(label="Name")
          UInput(
            v-model="renameName"
            placeholder="Budget name"
            maxlength="255"
          )
      template(v-else-if="mode === 'reset' && budget")
        p.text-sm
          | All accounts and entries in "{{ budget.name }}" will be replaced with a copy from your default budget.
      template(v-else-if="mode === 'delete' && budget")
        p.text-sm
          | "{{ budget.name }}" will be archived and removed from your list.

  template(#footer)
    .flex.gap-2.justify-end
      UButton(
        v-if="mode === 'create'"
        color="primary"
        :loading="isSubmitting"
        :disabled="!createName?.trim() || isSubmitting"
        @click="handleCreate"
      ) Create
      UButton(
        v-else-if="mode === 'rename'"
        color="primary"
        :loading="isSubmitting"
        :disabled="!renameName?.trim() || renameName === budget?.name || isSubmitting"
        @click="handleRename"
      ) Rename
      UButton(
        v-else-if="mode === 'reset'"
        color="warning"
        :loading="isSubmitting"
        :disabled="isSubmitting"
        @click="handleReset"
      ) Reset from default
      UButton(
        v-else-if="mode === 'delete'"
        color="error"
        :loading="isSubmitting"
        :disabled="isSubmitting"
        @click="handleDelete"
      ) Delete
      UButton(@click="cancel" color="neutral" variant="ghost") Cancel
</template>
