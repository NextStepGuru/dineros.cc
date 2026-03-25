<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import {
  handleError,
  formatAccountRegisters,
} from "~/lib/utils";
import { buildSortedCategorySelectItems } from "~/lib/categorySelect";
import { registerEntrySchema } from "~/schema/zod";
import type { RegisterEntry } from "~/types/types";

export type ModalRegisterEntryProps = {
  title: string;
  description: string;
  callback: () => void;
  cancel: () => void;
  registerEntry: RegisterEntry;
};

const state = reactive({
  isSaving: false,
  isDeleting: false,
  isClearing: false,
  isSkipping: false,
  isApplying: false,
  showApplySelection: false,
  isTransferMode: false,
});

const isDisabled = computed(() => {
  return (
    state.isSaving || state.isDeleting || state.isClearing || state.isSkipping
  );
});

const toast = useToast();
const listStore = useListStore();
const form = ref<{ submit?: () => void } | null>(null);
const selectedApplyAccountRegisterId = ref<number>(0);
const selectedTransferAccountRegisterId = ref<number>(0);
const transferTargetDescription = ref<string>("");
const showDeleteConfirm = ref(false);

const { $api } = useNuxtApp();

const props = defineProps<ModalRegisterEntryProps>();

const formState = ref<RegisterEntry>(props.registerEntry);

type RegisterEntryPlaidPayload = {
  plaidJson: unknown;
  plaidId: string;
  updatedAt: string;
  isPending: boolean;
};

const modalTab = ref<"edit" | "plaid">("edit");
const plaidSyncLoading = ref(false);
const plaidSyncData = ref<RegisterEntryPlaidPayload | null>(null);
const plaidSyncFetchKey = ref<string | null>(null);

const hasPlaidEntry = computed(() => {
  const id = formState.value.id;
  const pid = formState.value.plaidId;
  return Boolean(id && pid != null && String(pid).trim() !== "");
});

const isPlaidTabActive = computed(
  () => hasPlaidEntry.value && modalTab.value === "plaid",
);

const plaidJsonText = computed(() => {
  if (!plaidSyncData.value?.plaidJson) {
    return "(no Plaid JSON stored)";
  }
  try {
    return JSON.stringify(plaidSyncData.value.plaidJson, null, 2);
  } catch {
    return String(plaidSyncData.value.plaidJson);
  }
});

function resetPlaidSyncPanel() {
  modalTab.value = "edit";
  plaidSyncLoading.value = false;
  plaidSyncData.value = null;
  plaidSyncFetchKey.value = null;
}

async function loadPlaidSyncIfNeeded() {
  const id = formState.value.id;
  const accountRegisterId = formState.value.accountRegisterId;
  if (!id || !formState.value.plaidId) return;

  const key = `${id}:${accountRegisterId}`;
  if (plaidSyncFetchKey.value === key && plaidSyncData.value) return;

  plaidSyncLoading.value = true;
  plaidSyncData.value = null;
  try {
    const data = await $api<RegisterEntryPlaidPayload>(
      `/api/register-entry/${id}/plaid`,
      {
        query: { accountRegisterId },
      },
    ).catch((error) => handleError(error, toast));
    if (data) {
      plaidSyncData.value = data;
      plaidSyncFetchKey.value = key;
    }
  } finally {
    plaidSyncLoading.value = false;
  }
}

function selectPlaidTab() {
  modalTab.value = "plaid";
  void loadPlaidSyncIfNeeded();
}

async function copyPlaidJson() {
  try {
    await navigator.clipboard.writeText(plaidJsonText.value);
    toast.add({
      color: "success",
      description: "Plaid JSON copied to clipboard.",
    });
  } catch {
    toast.add({
      color: "error",
      description: "Could not copy to clipboard.",
    });
  }
}

const isNewEntry = computed(() => {
  const isNew = !formState.value.id;
  return isNew;
});

watch(props, () => {
  formState.value = {
    ...props.registerEntry,
  };
  // Reset transfer mode when props change
  state.isTransferMode = false;
  selectedTransferAccountRegisterId.value = 0;
  transferTargetDescription.value = "";
  resetPlaidSyncPanel();
});

const accountIdForEntry = computed(() => {
  const reg = listStore.getAccountRegisters.find(
    (r) => r.id === formState.value.accountRegisterId,
  );
  return reg?.accountId ?? null;
});

const categorySelectItems = computed(() => {
  const base = [{ id: null, name: "None", value: null, label: "None" }] as {
    id: string | null;
    name: string;
    value: string | null;
    label: string;
  }[];
  return [
    ...base,
    ...buildSortedCategorySelectItems(
      listStore.getCategories,
      accountIdForEntry.value,
    ),
  ];
});

async function handleSubmit({
  data: formData,
}: FormSubmitEvent<RegisterEntry>) {
  state.isSaving = true;
  try {
    let responseData;

    // Handle transfer creation for new entries
    if (
      isNewEntry.value &&
      state.isTransferMode &&
      selectedTransferAccountRegisterId.value
    ) {
      responseData = await $api("/api/register-entry-transfer-create", {
        method: "POST",
        body: {
          sourceAccountRegisterId: formData.accountRegisterId,
          targetAccountRegisterId: selectedTransferAccountRegisterId.value,
          amount: Math.abs(formData.amount), // Ensure positive amount
          description: formData.description,
          targetDescription: transferTargetDescription.value || undefined,
          createdAt: formData.createdAt,
        },
        onRequestError: () => {
          state.isSaving = false;
        },
      }).catch((error) => handleError(error, toast));

      if (!responseData) {
        state.isSaving = false;
        toast.add({
          color: "error",
          description: "Failed to create transfer.",
        });
        return;
      }

      props.callback();
      toast.add({
        color: "success",
        description: "Transfer created successfully.",
      });
      state.isSaving = false;
      props.cancel();
      return;
    }

    // Regular entry creation/update
    responseData = await $api("/api/register-entry", {
      method: "POST",
      body: formData,
      onRequestError: () => {
        state.isSaving = false;
      },
    }).catch((error) => handleError(error, toast));

    if (!responseData) {
      state.isSaving = false;
      toast.add({
        color: "error",
        description: "Failed to update register entry.",
      });

      return;
    }
    const parsedData = registerEntrySchema.parse(responseData);
    formState.value = {
      ...parsedData,
      createdAt: new Date(parsedData.createdAt).toISOString(),
    } as RegisterEntry;

    props.callback();

    toast.add({
      color: "success",
      description: "Updated register entry successfully.",
    });
    state.isSaving = false;
    props.cancel();
  } catch (error) {
    toast.add({
      color: "error",
      description:
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "An error occurred during register entry update.",
    });
  }
  state.isSaving = false;
}

async function deleteRegisterEntry() {
  state.isDeleting = true;
  const deleteEntry = await $api("/api/register-entry", {
    method: "DELETE",
    body: {
      registerEntryId: formState.value.id,
      accountRegisterId: formState.value.accountRegisterId,
    },
    onRequestError: () => {
      state.isDeleting = false;
    },
  }).catch((error) => handleError(error, toast));

  if (!deleteEntry) {
    state.isDeleting = false;
    showDeleteConfirm.value = false;
    toast.add({
      color: "error",
      description: "Failed to delete register entry.",
    });

    return;
  } else {
    toast.add({
      color: "success",
      description: "Deleted register entry successfully.",
    });

    props.callback();

    state.isDeleting = false;
    showDeleteConfirm.value = false;
    props.cancel();
  }
  state.isDeleting = false;
}

function confirmDelete() {
  showDeleteConfirm.value = true;
}

function cancelDeleteConfirmation() {
  showDeleteConfirm.value = false;
}

async function markAsCleared() {
  state.isClearing = true;
  const isMarked = await $api("/api/register-entry", {
    method: "patch",
    body: {
      registerEntryId: formState.value.id,
      accountRegisterId: formState.value.accountRegisterId,
      isCleared: true,
    },
    onRequestError: () => {
      state.isClearing = false;
    },
  }).catch((error) => handleError(error, toast));

  if (!isMarked) {
    state.isClearing = false;
    toast.add({
      color: "error",
      description: "Failed to mark as cleared",
    });

    return;
  } else {
    toast.add({
      color: "success",
      description: "Marked as cleared successfully.",
    });

    props.callback();

    state.isClearing = false;
    props.cancel();
  }
  state.isClearing = false;
}

async function markAsApplied() {
  state.isApplying = true;

  const targetAccountRegisterId =
    selectedApplyAccountRegisterId.value || formState.value.accountRegisterId;
  const isTransfer =
    targetAccountRegisterId !== formState.value.accountRegisterId;

  const endpoint = isTransfer
    ? "/api/register-entry-transfer"
    : "/api/register-entry-applied";

  await $api(endpoint, {
    method: "post",
    body: {
      registerEntryId: formState.value.id,
      accountRegisterId: formState.value.accountRegisterId,
      targetAccountRegisterId: isTransfer ? targetAccountRegisterId : undefined,
    },
    onRequestError: () => {
      state.isApplying = false;
    },
  }).catch((error) => handleError(error, toast));

  toast.add({
    color: "success",
    description: isTransfer
      ? "Transferred successfully."
      : "Marked as cleared successfully.",
  });

  props.callback();
  state.isApplying = false;
  state.showApplySelection = false;
}

function initiateApply() {
  if (listStore.getAccountRegisters.length > 1) {
    selectedApplyAccountRegisterId.value = formState.value.accountRegisterId;
    state.showApplySelection = true;
  } else {
    markAsApplied();
  }
}

function cancelApplySelection() {
  state.showApplySelection = false;
  selectedApplyAccountRegisterId.value = 0;
}

function toggleTransferMode() {
  state.isTransferMode = !state.isTransferMode;
  if (state.isTransferMode) {
    // Set default target account (first available account that's not current)
    if (transferDestinationAccounts.value.length > 0) {
      selectedTransferAccountRegisterId.value =
        transferDestinationAccounts.value[0].id;
    }
  } else {
    selectedTransferAccountRegisterId.value = 0;
    transferTargetDescription.value = "";
  }
}

async function skipRegisterEntry() {
  state.isSkipping = true;
  const isSkipped = await $api("/api/register-entry-skip", {
    method: "post",
    body: {
      registerEntryId: formState.value.id,
      accountRegisterId: formState.value.accountRegisterId,
    },
    onRequestError: () => {
      state.isSkipping = false;
    },
  }).catch((error) => handleError(error, toast));

  if (!isSkipped) {
    state.isSkipping = false;
    toast.add({
      color: "error",
      description: "Failed to skip register entry",
    });

    return;
  } else {
    toast.add({
      color: "success",
      description: "Skipped register entry successfully.",
    });

    props.callback();

    listStore.fetchLists();
    state.isSkipping = false;
    props.cancel();
  }

  state.isSkipping = false;
}

// ESC key handler to close modal
defineShortcuts({
  escape: () => {
    if (!isDisabled.value) {
      props.cancel();
    }
  },
});

// Add helper function to format account registers for selection
const formatAccountRegistersForSelection = computed(() => {
  return formatAccountRegisters(listStore.getAccountRegisters).map(
    (register) => ({
      id: register.id,
      name: register.name,
      label: register.name,
      value: register.id,
    }),
  );
});

// Available transfer destination accounts (excluding current account)
const transferDestinationAccounts = computed(() => {
  return formatAccountRegistersForSelection.value.filter(
    (account) => account.id !== formState.value.accountRegisterId,
  );
});
</script>

<template lang="pug">
UModal(title="Edit Register Entry" description="Edit Register Entry" class="modal-mobile-fullscreen")
  template(#body)
    // Apply Account Selection
    div(v-if="state.showApplySelection" class="space-y-4")
      h3(class="text-lg font-semibold") Apply Transaction To Account
      p(class="text-sm text-gray-600 dark:text-gray-400")
        | Select which account register to apply this transaction to:
      p(class="text-sm font-medium")
        | Transaction: {{ formState.description }} ({{ new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(formState.amount) }})

      UFormField(label="Target Account Register")
        USelect(
          v-model="selectedApplyAccountRegisterId"
          :items="formatAccountRegistersForSelection"
          value-key="id"
          label-key="label"
          placeholder="Select account register"
          class="w-full")

      div(class="text-xs text-gray-500 dark:text-gray-400 mt-2")
        p(v-if="selectedApplyAccountRegisterId === formState.accountRegisterId")
          | ✓ This will apply the transaction to the current account (standard behavior)
        p(v-else-if="selectedApplyAccountRegisterId")
          | ⚠️ This will create a transfer: the inverse amount will be applied to the selected account and this entry will be marked as cleared

    div(v-else class="space-y-4")
      // Tab bar (Plaid-linked saved entries only)
      div(v-if="hasPlaidEntry" class="flex flex-wrap gap-2")
        UButton(
          size="sm"
          :variant="modalTab === 'edit' ? 'solid' : 'outline'"
          @click="modalTab = 'edit'"
          class="cursor-pointer"
        ) Edit
        UButton(
          size="sm"
          :variant="modalTab === 'plaid' ? 'solid' : 'outline'"
          @click="selectPlaidTab"
          class="cursor-pointer"
        ) Plaid sync

      // Plaid payload (lazy-loaded)
      div(v-if="hasPlaidEntry && modalTab === 'plaid'" class="space-y-3")

        p(class="text-xs text-gray-600 dark:text-gray-400")
          | Last synced payload from Plaid for this entry. Edited description, category, or amount here may differ until the next sync updates this snapshot.

        div(class="flex flex-wrap gap-2 items-center")
          span(v-if="plaidSyncData" class="text-xs text-gray-500")
            | Updated {{ plaidSyncData.updatedAt }} · pending (Plaid): {{ plaidSyncData.isPending }}
          UButton(
            size="sm"
            variant="outline"
            @click="copyPlaidJson"
            :disabled="plaidSyncLoading || !plaidSyncData"
            class="cursor-pointer"
          ) Copy JSON

        div(v-if="plaidSyncLoading" class="text-sm text-gray-500") Loading Plaid data…

        pre(
          v-else
          class="max-h-96 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-xs font-mono whitespace-pre-wrap wrap-break-word") {{ plaidJsonText }}

      // Regular Edit Form
      UForm(
        v-if="!hasPlaidEntry || modalTab === 'edit'"
        class="space-y-4"
        @submit.prevent="handleSubmit"
        :state="formState"
        @error="handleError($event, toast)"
        :disabled="isDisabled"
        ref="form")

        // Transfer Mode Toggle (only for new entries)
        div(v-if="isNewEntry" class="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg")
          p(class="text-xs text-gray-500") Debug: isNewEntry = {{ isNewEntry }}, id = {{ formState.id }}
          UCheckbox(v-model="state.isTransferMode" @change="toggleTransferMode")
          label(class="text-sm font-medium cursor-pointer" @click="toggleTransferMode") Create Transfer Between Accounts

        // Transfer Mode Info
        div(v-if="state.isTransferMode && isNewEntry" class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800")
          p(class="text-sm text-blue-700 dark:text-blue-300 mb-2")
            | 💡 Transfer mode creates two entries: money going out of this account and money going into the destination account.
          p(class="text-xs text-blue-600 dark:text-blue-400")
            | The amount will be deducted from the current account and added to the destination account.

        UFormField(label="Description" name="description")
          UInput(v-model="formState.description" type="text" id="description" class="w-full" :disabled="formState.isProjected")

        UFormField(label="Category" name="categoryId")
          USelectMenu(
            v-model="formState.categoryId"
            :items="categorySelectItems"
            value-key="value"
            label-key="label"
            :filter-fields="['label', 'name']"
            placeholder="None"
            class="w-full"
            :disabled="formState.isProjected")

        // Transfer destination and description (only in transfer mode for new entries)
        div(v-if="state.isTransferMode && isNewEntry" class="space-y-4")
          UFormField(label="Destination Account")
            USelect(
              v-model="selectedTransferAccountRegisterId"
              :items="transferDestinationAccounts"
              value-key="id"
              label-key="label"
              placeholder="Select destination account"
              class="w-full")

          UFormField(label="Destination Description (Optional)")
            UInput(
              v-model="transferTargetDescription"
              type="text"
              placeholder="Leave empty to auto-generate"
              class="w-full")

          div(class="text-xs text-gray-500 dark:text-gray-400")
            p(v-if="!transferTargetDescription")
              | Auto-generated: "Transfer from {{ listStore.getAccountRegisters.find(a => a.id === formState.accountRegisterId)?.name }}"

        .flex.space-x-4
          UFormField(label="Amount" name="amount")
            UInputNumber(
              v-model="formState.amount"
              :format-options="formatCurrencyOptions"
              :step="0.01"
              id="amount"
              class="w-full"
              :disabled="formState.isProjected")
          UFormField(label="Entry At" name="createdAt" class="flex-1")
            UInput(v-model="formState.createdAt" type="date" class="w-full" :disabled="formState.isProjected")

  template(#footer)
    // Apply Selection Footer
    div(v-if="state.showApplySelection" class="flex justify-between w-full")
      UButton(
        color="primary"
        @click="markAsApplied"
        :loading="state.isApplying"
        :disabled="!selectedApplyAccountRegisterId || state.isApplying"
        class="cursor-pointer"
      ) Confirm Apply

      UButton(
        @click="cancelApplySelection"
        color="neutral"
        :disabled="state.isApplying"
        class="cursor-pointer"
      ) Cancel

    // Regular Action Footer
    div(v-else class="w-full")
      div(
        v-if="showDeleteConfirm"
        class="mb-3 p-3 rounded-md border border-error/30 bg-error/10 text-sm")
        p(class="mb-2") Are you sure you want to delete this register entry? This action cannot be undone.
        div(class="flex gap-2")
          UButton(
            color="error"
            @click="deleteRegisterEntry"
            :loading="state.isDeleting"
            :disabled="isDisabled || isPlaidTabActive"
            class="cursor-pointer"
          ) Confirm delete
          UButton(
            color="neutral"
            @click="cancelDeleteConfirmation"
            :disabled="state.isDeleting"
            class="cursor-pointer"
          ) Cancel
      div(class="flex justify-between w-full")
      UButton(
        color="primary"
        @click.prevent="form?.submit()"
        :loading="state.isSaving"
        :disabled="isDisabled || isPlaidTabActive || (state.isTransferMode && isNewEntry && !selectedTransferAccountRegisterId)"
        class="cursor-pointer"
      ) {{ state.isTransferMode && isNewEntry ? 'Create Transfer' : 'Save' }}

      UButton(
        color="info"
        v-if="formState.id && !formState.isProjected || formState.id && formState.isPending"
        @click="markAsCleared"
        :loading="state.isClearing"
        :disabled="isDisabled || isPlaidTabActive"
        class="cursor-pointer"
      ) Clear

      UButton(
        color="info"
        v-if="formState.id && !formState.isProjected || formState.id && formState.isPending"
        @click="initiateApply"
        :loading="state.isApplying"
        :disabled="isDisabled || isPlaidTabActive"
        class="cursor-pointer"
      ) Apply

      UButton(
        color="error"
        @click="confirmDelete"
        :loading="state.isDeleting"
        :disabled="isDisabled || isPlaidTabActive || showDeleteConfirm"
        v-if="formState.id && !formState.isProjected || formState.id && formState.isPending"
        class="cursor-pointer"
      ) Delete

      UButton(
        color="error"
        @click="skipRegisterEntry"
        :loading="state.isSkipping"
        :disabled="isDisabled || isPlaidTabActive"
        class="cursor-pointer"
        v-if="formState.id && formState.reoccurrenceId && formState.isProjected"
      ) Skip Reoccurrence

      UButton(@click="cancel" color="neutral" :disabled="isDisabled" class="cursor-pointer") Close
</template>
