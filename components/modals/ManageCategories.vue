<script setup lang="ts">
import type { Category } from "~/types/types";
import { handleError } from "~/lib/utils";

export type ManageCategoriesProps = {
  accountId: string;
  callback: () => void;
  cancel: () => void;
};

const props = defineProps<ManageCategoriesProps>();
const toast = useToast();
const listStore = useListStore();
const { $api } = useNuxtApp();

const categoriesForAccount = computed(() =>
  listStore.getCategories.filter((c) => c.accountId === props.accountId)
);

const newName = ref("");
const isAdding = ref(false);
const savingId = ref<string | null>(null);
const editingId = ref<string | null>(null);
const editName = ref("");

function startEdit(cat: Category) {
  editingId.value = cat.id;
  editName.value = cat.name;
}

function cancelEdit() {
  editingId.value = null;
  editName.value = "";
}

async function saveEdit() {
  if (!editingId.value || !editName.value.trim()) {
    cancelEdit();
    return;
  }
  savingId.value = editingId.value;
  try {
    await $api("/api/category", {
      method: "PATCH",
      body: { id: editingId.value, name: editName.value.trim() },
    }).catch((err) => handleError(err, toast));
    await listStore.fetchLists();
    toast.add({ color: "success", description: "Category updated." });
    cancelEdit();
  } finally {
    savingId.value = null;
  }
}

async function addCategory() {
  const name = newName.value?.trim();
  if (!name || !props.accountId) return;
  isAdding.value = true;
  try {
    await $api("/api/category", {
      method: "POST",
      body: { accountId: props.accountId, name },
    }).catch((err) => handleError(err, toast));
    newName.value = "";
    await listStore.fetchLists();
    toast.add({ color: "success", description: "Category added." });
  } finally {
    isAdding.value = false;
  }
}

async function archiveCategory(id: string) {
  try {
    await $api("/api/category", {
      method: "DELETE",
      query: { id },
    }).catch((err) => handleError(err, toast));
    await listStore.fetchLists();
    toast.add({ color: "success", description: "Category archived." });
    if (editingId.value === id) cancelEdit();
  } catch {
    // handleError already toasts
  }
}

defineShortcuts({
  escape: () => {
    if (editingId.value) cancelEdit();
    else props.cancel();
  },
});
</script>

<template lang="pug">
UModal(
  title="Manage Categories"
  description="Add, edit, or archive categories for this account."
  class="max-sm:!w-full max-sm:!max-w-none"
)
  template(#body)
    .space-y-4
      form.flex.gap-2(@submit.prevent="addCategory")
        UInput(
          v-model="newName"
          placeholder="New category name"
          class="flex-1"
        )
        UButton(
          type="submit"
          color="primary"
          :loading="isAdding"
          :disabled="!newName?.trim() || isAdding"
        ) Add

      ul.divide-y(class="dark:divide-gray-700")
        li.p-2.flex.items-center.gap-2(
          v-for="cat in categoriesForAccount"
          :key="cat.id"
        )
          template(v-if="editingId === cat.id")
            UInput(
              v-model="editName"
              class="flex-1"
              @keydown.enter.prevent="saveEdit"
              @keydown.escape="cancelEdit"
            )
            UButton(size="xs" @click="saveEdit" :loading="savingId === cat.id") Save
            UButton(size="xs" color="neutral" variant="ghost" @click="cancelEdit") Cancel
          template(v-else)
            span.flex-1 {{ cat.name }}
            UButton(
              size="xs"
              variant="ghost"
              color="neutral"
              @click="startEdit(cat)"
            ) Edit
            UButton(
              size="xs"
              variant="ghost"
              color="error"
              @click="archiveCategory(cat.id)"
            ) Archive

      p.text-sm.text-gray-500(class="dark:text-gray-400")(
        v-if="categoriesForAccount.length === 0 && !newName"
      )
        | No categories yet. Add one above.

  template(#footer)
    UButton(@click="cancel" color="neutral") Close
</template>
